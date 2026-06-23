import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  .inputValidator((d: unknown) =>
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
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
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
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("threads")
      .select("id, title, model")
      .eq("id", data.threadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateThreadModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
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
      .select("system_prompt, display_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { system_prompt: null, display_name: null };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        system_prompt: z.string().max(4000).nullable().optional(),
        display_name: z.string().max(80).nullable().optional(),
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
  .inputValidator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
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
  .inputValidator((d: unknown) =>
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
  .inputValidator((d: unknown) =>
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