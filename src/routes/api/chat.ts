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

type Attachment = { kind: "image"; url: string; name?: string };

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

        // Verify thread ownership (RLS will also enforce) and fetch its model.
        const { data: thread } = await supabase
          .from("threads")
          .select("id, title, model")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return new Response("Thread not found", { status: 404 });
        const modelId = ALLOWED_MODELS.has(thread.model)
          ? thread.model
          : "google/gemini-3-flash-preview";

        // Per-user custom instructions
        const { data: profile } = await supabase
          .from("profiles")
          .select("system_prompt")
          .eq("user_id", userId)
          .maybeSingle();
        const userInstructions = (profile?.system_prompt ?? "").trim();
        const SYSTEM_PROMPT = userInstructions
          ? `${BASE_SYSTEM}\n\nUser custom instructions:\n${userInstructions}`
          : BASE_SYSTEM;

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
                : mm.content
                    .map((p) => (p.type === "text" ? p.text : ""))
                    .join("");
            mm.content = [
              { type: "text", text: baseText },
              ...attachments.map((a) => ({ type: "image" as const, image: a.url })),
            ];
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
            attachments: attachments as unknown as Record<string, unknown>[],
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