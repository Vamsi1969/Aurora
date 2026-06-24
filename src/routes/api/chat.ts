import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage, type ModelMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const ALLOWED_MODELS = new Set([
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5",
  "openai/gpt-5-mini",
]);

const BASE_SYSTEM = `You are Aurora, a thoughtful and conversational AI assistant.
- Be direct, warm, and concise. Avoid filler.
- Use markdown for structure: headings, lists, and fenced code blocks with language tags.
- When unsure, say so briefly and ask a clarifying question.`;

type Attachment = {
  kind: "image" | "file";
  url: string;
  name?: string;
  mediaType?: string;
};

function textOf(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = createClient<Database>(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}`, apikey: supabasePublishable } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (claimsErr || !userId) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as {
          messages: UIMessage[];
          threadId: string;
          attachments?: Attachment[];
        };
        const { messages, threadId, attachments = [] } = body;
        if (!Array.isArray(messages) || !threadId) {
          return new Response("Bad request", { status: 400 });
        }

        const MAX_ATTACHMENTS = 6;
        const MAX_ATTACHMENT_BYTES = 22 * 1024 * 1024; // ~16MB binary as base64
        const MAX_MESSAGES = 200;
        const MAX_MESSAGE_TEXT = 50_000;
        if (attachments.length > MAX_ATTACHMENTS) {
          return new Response("Too many attachments", { status: 400 });
        }
        for (const a of attachments) {
          if (typeof a?.url !== "string" || a.url.length > MAX_ATTACHMENT_BYTES) {
            return new Response("Attachment too large", { status: 413 });
          }
        }
        if (messages.length > MAX_MESSAGES) {
          return new Response("Too many messages", { status: 400 });
        }
        for (const m of messages) {
          if (textOf(m).length > MAX_MESSAGE_TEXT) {
            return new Response("Message too large", { status: 413 });
          }
        }

        // Verify thread ownership (RLS will also enforce) and fetch its model + persona.
        const { data: thread } = await supabase
          .from("threads")
          .select("id, title, model, persona_id")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return new Response("Thread not found", { status: 404 });
        const modelId = ALLOWED_MODELS.has(thread.model)
          ? thread.model
          : "google/gemini-3-flash-preview";

        let personaPrompt = "";
        if (thread.persona_id) {
          const { data: persona } = await supabase
            .from("personas")
            .select("system_prompt, name")
            .eq("id", thread.persona_id)
            .maybeSingle();
          if (persona?.system_prompt) {
            personaPrompt = `\n\nActive persona: ${persona.name}.\n${persona.system_prompt}`;
          }
        }
        const SYSTEM_PROMPT = BASE_SYSTEM + personaPrompt;

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const lastUserText = lastUser ? textOf(lastUser) : "";

        // Build multimodal model messages: append image parts to the last user msg
        const modelMessages: ModelMessage[] = await convertToModelMessages(messages);
        if (attachments.length > 0) {
          for (let i = modelMessages.length - 1; i >= 0; i--) {
            const mm = modelMessages[i];
            if (mm.role !== "user") continue;
            const baseText =
              typeof mm.content === "string"
                ? mm.content
                : mm.content.map((p) => (p.type === "text" ? p.text : "")).join("");
            const attachParts = attachments.map((a) =>
              a.kind === "image"
                ? { type: "image" as const, image: a.url }
                : {
                    type: "file" as const,
                    data: a.url,
                    mediaType: a.mediaType ?? "application/pdf",
                  },
            );
            mm.content = [{ type: "text", text: baseText }, ...attachParts];
            break;
          }
        }

        // Persist the user's new message with its attachments
        if (lastUserText || attachments.length > 0) {
          await supabase.from("messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            content: lastUserText,
            attachments: attachments as never,
          });
        }

        // Auto-title from first user message if still default.
        if (thread.title === "New chat" && lastUserText) {
          const title = lastUserText.replace(/\s+/g, " ").trim().slice(0, 60);
          await supabase.from("threads").update({ title }).eq("id", threadId);
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway(modelId);

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: modelMessages,
          onFinish: async ({ text }) => {
            if (text?.trim()) {
              await supabase.from("messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                content: text,
              });
            }
          },
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
