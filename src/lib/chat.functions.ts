import { createServerFn } from "@tanstack/react-start";
import { requireMongoAuth } from "@/integrations/mongodb/auth-middleware";
import { z } from "zod";
import { getDb } from "@/integrations/mongodb/client";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import {
  listThreads as mongoListThreads,
  createThread as mongoCreateThread,
  renameThread as mongoRenameThread,
  deleteThread as mongoDeleteThread,
  getThreadMeta as mongoGetThreadMeta,
  updateThreadModel as mongoUpdateThreadModel,
  getThreadByShareId as mongoGetThreadByShareId,
  updateShareId as mongoUpdateShareId,
  getShareInfo as mongoGetShareInfo,
} from "@/integrations/mongodb/threads";
import {
  getThreadMessages as mongoGetThreadMessages,
  insertMessage as mongoInsertMessage,
  insertMessages as mongoInsertMessages,
  dropLastAssistant as mongoDropLastAssistant,
  truncateFromMessage as mongoTruncateFromMessage,
} from "@/integrations/mongodb/messages";
import {
  getProfile as mongoGetProfile,
  upsertProfile as mongoUpsertProfile,
} from "@/integrations/mongodb/profiles";

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    return mongoListThreads(context.db, context.userId);
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    return mongoCreateThread(context.db, context.userId, "New chat");
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().min(1), title: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await mongoRenameThread(context.db, data.id, context.userId, data.title);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await mongoDeleteThread(context.db, data.id, context.userId);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    return mongoGetThreadMessages(context.db, data.threadId);
  });

export const getThreadMeta = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    return mongoGetThreadMeta(context.db, data.threadId);
  });

export const updateThreadModel = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().min(1), model: z.string().min(3).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await mongoUpdateThreadModel(context.db, data.id, context.userId, data.model);
    return { ok: true };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    return mongoGetProfile(context.db, context.userId);
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
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
    await mongoUpsertProfile(context.db, context.userId, data);
    return { ok: true };
  });

// Delete the trailing assistant message (used by "Regenerate")
export const dropLastAssistant = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await mongoDropLastAssistant(context.db, data.threadId, context.userId);
    return { ok: true };
  });

// Delete a message and every message created after it (used by "Edit")
export const truncateFromMessage = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) =>
    z.object({ threadId: z.string().min(1), messageId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await mongoTruncateFromMessage(context.db, data.threadId, context.userId, data.messageId);
    return { ok: true };
  });

// Insert a user→assistant pair (used by slash-image generation)
export const saveImageGeneration = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) =>
    z
      .object({
        threadId: z.string().min(1),
        prompt: z.string().min(1).max(2000),
        imageDataUrl: z.string().startsWith("data:image/"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await mongoInsertMessages(context.db, [
      {
        threadId: data.threadId,
        userId: context.userId,
        role: "user",
        content: `/image ${data.prompt}`,
        attachments: [],
      },
      {
        threadId: data.threadId,
        userId: context.userId,
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
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const info = await mongoGetShareInfo(context.db, data.threadId);
    if (info.shareId) return { shareId: info.shareId };
    const shareId = randomShareId();
    await mongoUpdateShareId(context.db, data.threadId, context.userId, shareId);
    return { shareId };
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await mongoUpdateShareId(context.db, data.threadId, context.userId, null);
    return { ok: true };
  });

export const getShareInfo = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .validator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    return mongoGetShareInfo(context.db, data.threadId);
  });

// Public read (anon) — used by /s/$shareId route
export const getSharedConversation = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ shareId: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const db = await getDb();
    const thread = await mongoGetThreadByShareId(db, data.shareId);
    if (!thread) return null;
    const messages = await mongoGetThreadMessages(db, thread.id);
    return { thread, messages };
  });

// Generate 3 short follow-up question suggestions based on the last exchange.
export const suggestFollowups = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
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
