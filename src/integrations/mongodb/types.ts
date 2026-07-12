import { ObjectId } from "mongodb";

export type ToolPanelType = "rag" | "resume";

export interface MongoUser {
  _id: ObjectId;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: Date;
}

export interface MongoThread {
  _id: ObjectId;
  userId: string;
  title: string;
  model: string;
  personaId?: string;
  shareId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoMessage {
  _id: ObjectId;
  threadId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  createdAt: Date;
}

export interface MongoProfile {
  _id: ObjectId;
  userId: string;
  displayName?: string;
  systemPrompt?: string;
  githubRepoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoPersona {
  _id: ObjectId;
  userId: string;
  name: string;
  description?: string;
  icon: string;
  systemPrompt: string;
  voice: string;
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Convert MongoDB _id to string id for client consumption. */
export function toId(doc: { _id: ObjectId }): string {
  return doc._id.toHexString();
}

/** Convert a thread document to the shape the client expects. */
export function threadToRow(t: MongoThread) {
  return {
    id: toId(t),
    title: t.title,
    model: t.model,
    persona_id: t.personaId ?? null,
    share_id: t.shareId ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    user_id: t.userId,
  };
}

/** Convert a message document to the shape the client expects. */
export function messageToRow(m: MongoMessage) {
  return {
    id: toId(m),
    thread_id: m.threadId,
    user_id: m.userId,
    role: m.role,
    content: m.content,
    attachments: m.attachments ?? [],
    created_at: m.createdAt.toISOString(),
  };
}
