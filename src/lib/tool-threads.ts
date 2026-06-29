import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Tool panel type prefix stored in the thread title. */
export type ToolPanelType = "rag" | "resume";

const TITLE_PREFIX: Record<ToolPanelType, string> = {
  rag: "[rag]",
  resume: "[resume]",
};

/** List all tool threads for a specific panel type. */
export const listToolThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ panelType: z.enum(["rag", "resume"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: threads, error } = await context.supabase
      .from("threads")
      .select("id, title, created_at, updated_at")
      .eq("user_id", context.userId)
      .eq("model", `tool-${data.panelType}`)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return threads ?? [];
  });

/** Load messages for a tool thread. */
export const loadToolThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Delete a tool thread and its messages (cascade). */
export const deleteToolThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
