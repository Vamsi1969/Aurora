import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .select("id, title, updated_at, created_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("threads")
      .insert({ user_id: context.userId, title: "New chat" })
      .select("id, title, updated_at, created_at")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, role, content, created_at, attachments")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getThreadMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("threads")
      .select("id, title, model, persona_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateThreadModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), model: z.string().min(3).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ model: data.model })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("system_prompt, display_name, github_repo_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { system_prompt: null, display_name: null, github_repo_url: null };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        system_prompt: z.string().max(4000).nullable().optional(),
        display_name: z.string().max(80).nullable().optional(),
        github_repo_url: z.string().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Delete the trailing assistant message (used by "Regenerate")
export const dropLastAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("messages")
      .select("id, role, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = rows?.[0];
    if (last && last.role === "assistant") {
      await context.supabase.from("messages").delete().eq("id", last.id);
    }
    return { ok: true };
  });

// Delete a message and every message created after it (used by "Edit")
export const truncateFromMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ threadId: z.string().uuid(), messageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: anchor } = await context.supabase
      .from("messages")
      .select("created_at")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!anchor) return { ok: true };
    await context.supabase
      .from("messages")
      .delete()
      .eq("thread_id", data.threadId)
      .gte("created_at", anchor.created_at);
    return { ok: true };
  });

// Insert a user→assistant pair (used by slash-image generation)
export const saveImageGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        prompt: z.string().min(1).max(2000),
        imageDataUrl: z.string().startsWith("data:image/"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("messages").insert([
      {
        thread_id: data.threadId,
        user_id: context.userId,
        role: "user",
        content: `/image ${data.prompt}`,
        attachments: [],
      },
      {
        thread_id: data.threadId,
        user_id: context.userId,
        role: "assistant",
        content: "",
        attachments: [{ kind: "image", url: data.imageDataUrl }],
      },
    ]);
    return { ok: true };
  });

// --- Share links -----------------------------------------------------------

function randomShareId(): string {
  // url-safe id, ~22 chars
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 22);
}

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("threads")
      .select("share_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (existing?.share_id) return { shareId: existing.share_id };
    const shareId = randomShareId();
    const { error } = await context.supabase
      .from("threads")
      .update({ share_id: shareId })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { shareId };
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ share_id: null })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getShareInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("threads")
      .select("share_id")
      .eq("id", data.threadId)
      .maybeSingle();
    return { shareId: row?.share_id ?? null };
  });

// Public read (anon) — used by /s/$shareId route
export const getSharedConversation = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ shareId: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: thread } = await sb
      .from("threads")
      .select("id, title, created_at")
      .eq("share_id", data.shareId)
      .maybeSingle();
    if (!thread) return null;
    const { data: messages } = await sb
      .from("messages")
      .select("id, role, content, created_at, attachments")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });
    return { thread, messages: messages ?? [] };
  });

// Generate 3 short follow-up question suggestions based on the last exchange.
export const suggestFollowups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        userText: z.string().max(4000).default(""),
        assistantText: z.string().min(1).max(8000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { suggestions: [] as string[] };

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");
    const system = `You generate follow-up question suggestions for a chat assistant, in the style of ChatGPT's "Suggested" chips.

Rules:
- Suggestions must be tightly related to the assistant's most recent reply and the user's question.
- They should help the user go DEEPER on the same topic: ask for an example, a comparison, the next step, a clarification, a trade-off, or a related concept just mentioned.
- Do NOT change the subject, do NOT repeat what was already answered, do NOT ask the assistant to repeat itself.
- Write from the user's first-person perspective ("Show me...", "How would I...", "What about...").
- Each suggestion is a single short question or request, under 70 characters, no numbering, no quotes, no emojis.
- Output ONLY a JSON array of exactly 3 distinct strings. No prose, no markdown fences.`;

    const prompt = `User asked:
"""${data.userText || "(no prior user message)"}"""

Assistant replied:
"""${data.assistantText.slice(0, 6000)}"""

Return 3 follow-up suggestions related to this exchange.`;

    try {
      const { text } = await generateText({ model, system, prompt });
      const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      const start = cleaned.indexOf("[");
      const end = cleaned.lastIndexOf("]");
      if (start < 0 || end < 0) return { suggestions: [] as string[] };
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (!Array.isArray(parsed)) return { suggestions: [] as string[] };
      const suggestions = parsed
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().replace(/^["'\u201C\u2018]+|["'\u201D\u2019]+$/g, ""))
        .filter(Boolean)
        .slice(0, 3);
      return { suggestions };
    } catch {
      return { suggestions: [] as string[] };
    }
  });
