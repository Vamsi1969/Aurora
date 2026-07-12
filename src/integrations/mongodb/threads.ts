import { ObjectId, type Db } from "mongodb";
import type { MongoThread } from "./types";
import { threadToRow } from "./types";

/**
 * List all threads for a user, ordered by most recently updated.
 */
export async function listThreads(db: Db, userId: string) {
  const docs = await db
    .collection<MongoThread>("threads")
    .find({ userId })
    .sort({ updatedAt: -1 })
    .toArray();
  return docs.map(threadToRow);
}

/**
 * Create a new thread for a user.
 */
export async function createThread(db: Db, userId: string, title: string) {
  const now = new Date();
  const doc: MongoThread = {
    _id: new ObjectId(),
    userId,
    title,
    model: "google/gemini-3-flash-preview",
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<MongoThread>("threads").insertOne(doc);
  return threadToRow(doc);
}

/**
 * Rename a thread.
 */
export async function renameThread(db: Db, threadId: string, userId: string, title: string) {
  const { matchedCount } = await db
    .collection<MongoThread>("threads")
    .updateOne({ _id: new ObjectId(threadId), userId }, { $set: { title, updatedAt: new Date() } });
  return matchedCount > 0;
}

/**
 * Delete a thread and all its messages.
 */
export async function deleteThread(db: Db, threadId: string, userId: string) {
  const oid = new ObjectId(threadId);
  await db.collection<MongoThread>("threads").deleteOne({ _id: oid, userId });
  await db.collection("messages").deleteMany({ threadId, userId });
}

/**
 * Get thread metadata (title, model, persona_id).
 */
export async function getThreadMeta(db: Db, threadId: string) {
  const doc = await db
    .collection<MongoThread>("threads")
    .findOne({ _id: new ObjectId(threadId) }, { projection: { title: 1, model: 1, personaId: 1 } });
  if (!doc) return null;
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    model: doc.model,
    persona_id: doc.personaId ?? null,
  };
}

/**
 * Update the model used by a thread.
 */
export async function updateThreadModel(db: Db, threadId: string, userId: string, model: string) {
  const { matchedCount } = await db
    .collection<MongoThread>("threads")
    .updateOne({ _id: new ObjectId(threadId), userId }, { $set: { model, updatedAt: new Date() } });
  return matchedCount > 0;
}

/**
 * List tool threads for a specific panel type (rag, resume).
 */
export async function listToolThreads(db: Db, userId: string, panelType: "rag" | "resume") {
  const docs = await db
    .collection<MongoThread>("threads")
    .find({ userId, model: `tool-${panelType}` })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray();
  return docs.map(threadToRow);
}

/**
 * Look up a thread by its share_id (for shared conversations).
 */
export async function getThreadByShareId(db: Db, shareId: string) {
  const doc = await db
    .collection<MongoThread>("threads")
    .findOne({ shareId }, { projection: { title: 1, createdAt: 1 } });
  if (!doc) return null;
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    created_at: doc.createdAt.toISOString(),
  };
}

/**
 * Update a thread's share_id (create or revoke share link).
 */
export async function updateShareId(
  db: Db,
  threadId: string,
  userId: string,
  shareId: string | null,
) {
  if (shareId === null) {
    await db
      .collection<MongoThread>("threads")
      .updateOne(
        { _id: new ObjectId(threadId), userId },
        { $unset: { shareId: "" }, $set: { updatedAt: new Date() } },
      );
  } else {
    await db
      .collection<MongoThread>("threads")
      .updateOne(
        { _id: new ObjectId(threadId), userId },
        { $set: { shareId, updatedAt: new Date() } },
      );
  }
}

/**
 * Get a thread by its ID (for ownership verification).
 */
export async function getThreadById(db: Db, threadId: string) {
  const doc = await db.collection<MongoThread>("threads").findOne({ _id: new ObjectId(threadId) });
  if (!doc) return null;
  return threadToRow(doc);
}

/**
 * Get the share_id for a thread.
 */
export async function getShareInfo(db: Db, threadId: string) {
  const doc = await db
    .collection<MongoThread>("threads")
    .findOne({ _id: new ObjectId(threadId) }, { projection: { shareId: 1 } });
  return { shareId: doc?.shareId ?? null };
}

/**
 * Update a thread's persona.
 */
export async function setThreadPersona(
  db: Db,
  threadId: string,
  userId: string,
  personaId: string | null,
) {
  if (personaId === null) {
    await db
      .collection<MongoThread>("threads")
      .updateOne(
        { _id: new ObjectId(threadId), userId },
        { $unset: { personaId: "" }, $set: { updatedAt: new Date() } },
      );
  } else {
    await db
      .collection<MongoThread>("threads")
      .updateOne(
        { _id: new ObjectId(threadId), userId },
        { $set: { personaId, updatedAt: new Date() } },
      );
  }
}

/**
 * Update a thread's title (used for auto-title on first message).
 */
export async function updateThreadTitle(db: Db, threadId: string, userId: string, title: string) {
  await db
    .collection<MongoThread>("threads")
    .updateOne({ _id: new ObjectId(threadId), userId }, { $set: { title, updatedAt: new Date() } });
}
