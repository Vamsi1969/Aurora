import { ObjectId, type Db } from "mongodb";
import type { MongoProfile } from "./types";

/**
 * Get a user's profile.
 */
export async function getProfile(db: Db, userId: string) {
  const doc = await db
    .collection<MongoProfile>("profiles")
    .findOne({ userId }, { projection: { systemPrompt: 1, displayName: 1, githubRepoUrl: 1 } });
  if (!doc) {
    return { system_prompt: null, display_name: null, github_repo_url: null };
  }
  return {
    system_prompt: doc.systemPrompt ?? null,
    display_name: doc.displayName ?? null,
    github_repo_url: doc.githubRepoUrl ?? null,
  };
}

/**
 * Upsert a user's profile (create if not exists, update if exists).
 */
export async function upsertProfile(
  db: Db,
  userId: string,
  data: {
    system_prompt?: string | null;
    display_name?: string | null;
    github_repo_url?: string | null;
  },
) {
  const now = new Date();
  const setFields: Record<string, unknown> = { updatedAt: now };
  if (data.system_prompt !== undefined) setFields.systemPrompt = data.system_prompt;
  if (data.display_name !== undefined) setFields.displayName = data.display_name;
  if (data.github_repo_url !== undefined) setFields.githubRepoUrl = data.github_repo_url;

  await db.collection<MongoProfile>("profiles").updateOne(
    { userId },
    {
      $set: setFields,
      $setOnInsert: {
        _id: new ObjectId(),
        userId,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}
