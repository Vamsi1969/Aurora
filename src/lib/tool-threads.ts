import { createServerFn } from "@tanstack/react-start";
import { requireMongoAuth } from "@/integrations/mongodb/auth-middleware";
import { z } from "zod";
import {
  listToolThreads as mongoListToolThreads,
  deleteThread as mongoDeleteThread,
} from "@/integrations/mongodb/threads";
import { getThreadMessages as mongoGetThreadMessages } from "@/integrations/mongodb/messages";

/** Tool panel type stored in the thread title. */
export type ToolPanelType = "rag" | "resume";

/** List all tool threads for a specific panel type. */
export const listToolThreads = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ panelType: z.enum(["rag", "resume"]) }).parse(d))
  .handler(async ({ data, context }) => {
    return mongoListToolThreads(context.db, context.userId, data.panelType);
  });

/** Load messages for a tool thread. */
export const loadToolThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    return mongoGetThreadMessages(context.db, data.threadId);
  });

/** Delete a tool thread and its messages (cascade). */
export const deleteToolThread = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await mongoDeleteThread(context.db, data.threadId, context.userId);
    return { ok: true };
  });
