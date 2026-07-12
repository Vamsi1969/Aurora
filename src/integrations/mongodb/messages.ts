import { ObjectId, type Db } from "mongodb";
import type { MongoMessage } from "./types";
import { messageToRow } from "./types";

/**
 * Get all messages for a thread, ordered by creation time.
 */
export async function getThreadMessages(db: Db, threadId: string) {
  const docs = await db
    .collection<MongoMessage>("messages")
    .find({ threadId })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(messageToRow);
}

/**
 * Insert a single message into a thread.
 */
export async function insertMessage(
  db: Db,
  data: {
    threadId: string;
    userId: string;
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  },
) {
  const doc: MongoMessage = {
    _id: new ObjectId(),
    threadId: data.threadId,
    userId: data.userId,
    role: data.role,
    content: data.content,
    attachments: data.attachments ?? [],
    createdAt: new Date(),
  };
  await db.collection<MongoMessage>("messages").insertOne(doc);
  return messageToRow(doc);
}

/**
 * Insert multiple messages (e.g., user + assistant pair for image generation).
 */
export async function insertMessages(
  db: Db,
  messages: Array<{
    threadId: string;
    userId: string;
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }>,
) {
  const now = new Date();
  const docs: MongoMessage[] = messages.map((m) => ({
    _id: new ObjectId(),
    threadId: m.threadId,
    userId: m.userId,
    role: m.role,
    content: m.content,
    attachments: m.attachments ?? [],
    createdAt: now,
  }));
  await db.collection<MongoMessage>("messages").insertMany(docs);
  return docs.map(messageToRow);
}

/**
 * Delete the last assistant message in a thread (used by "Regenerate").
 */
export async function dropLastAssistant(db: Db, threadId: string, userId: string) {
  const last = await db
    .collection<MongoMessage>("messages")
    .findOne({ threadId, role: "assistant", userId }, { sort: { createdAt: -1 } });
  if (last) {
    await db.collection<MongoMessage>("messages").deleteOne({ _id: last._id });
  }
}

/**
 * Delete a message and every message created after it (used by "Edit").
 */
export async function truncateFromMessage(
  db: Db,
  threadId: string,
  userId: string,
  messageId: string,
) {
  const anchor = await db
    .collection<MongoMessage>("messages")
    .findOne({ _id: new ObjectId(messageId) });
  if (!anchor) return;
  await db.collection<MongoMessage>("messages").deleteMany({
    threadId,
    userId,
    createdAt: { $gte: anchor.createdAt },
  });
}

/**
 * Search messages belonging to a user using MongoDB text search.
 * Requires a text index on the `content` field.
 */
export async function searchMessages(db: Db, userId: string, query: string, limit = 10) {
  const docs = await db
    .collection<MongoMessage>("messages")
    .aggregate([
      {
        $match: {
          userId,
          $text: { $search: query },
        },
      },
      {
        $sort: { score: { $meta: "textScore" } },
      },
      { $limit: limit },
      {
        $addFields: {
          threadObjectId: { $toObjectId: "$threadId" },
        },
      },
      {
        $lookup: {
          from: "threads",
          localField: "threadObjectId",
          foreignField: "_id",
          as: "thread",
        },
      },
      {
        $unwind: { path: "$thread", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 0,
          threadObjectId: 0,
          id: { $toString: "$_id" },
          content: 1,
          thread_id: "$threadId",
          created_at: { $dateToString: { format: "%Y-%m-%dT%H:%M:%S.%LZ", date: "$createdAt" } },
          thread_title: "$thread.title",
        },
      },
    ])
    .toArray();
  return docs;
}
