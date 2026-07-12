import { ObjectId, type Db } from "mongodb";
import type { MongoPersona } from "./types";

/**
 * Convert a persona document to the shape the client expects.
 */
function personaToRow(p: MongoPersona) {
  return {
    id: p._id.toHexString(),
    name: p.name,
    description: p.description ?? null,
    system_prompt: p.systemPrompt,
    voice: p.voice,
    icon: p.icon,
    is_built_in: p.isBuiltIn,
    created_at: p.createdAt.toISOString(),
  };
}

/**
 * List all personas available to a user (their own + built-in).
 */
export async function listPersonas(db: Db, userId: string) {
  const docs = await db
    .collection<MongoPersona>("personas")
    .find({
      $or: [{ userId }, { isBuiltIn: true }],
    })
    .sort({ isBuiltIn: -1, createdAt: 1 })
    .toArray();
  return docs.map(personaToRow);
}

/**
 * Create a new custom persona.
 */
export async function createPersona(
  db: Db,
  userId: string,
  data: {
    name: string;
    description?: string | null;
    system_prompt: string;
    voice: string;
    icon: string;
  },
) {
  const now = new Date();
  const doc: MongoPersona = {
    _id: new ObjectId(),
    userId,
    name: data.name,
    description: data.description ?? undefined,
    systemPrompt: data.system_prompt,
    voice: data.voice,
    icon: data.icon,
    isBuiltIn: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<MongoPersona>("personas").insertOne(doc);
  return personaToRow(doc);
}

/**
 * Update an existing custom persona.
 */
export async function updatePersona(
  db: Db,
  personaId: string,
  data: {
    name: string;
    description?: string | null;
    system_prompt: string;
    voice: string;
    icon: string;
  },
) {
  const { matchedCount } = await db.collection<MongoPersona>("personas").updateOne(
    { _id: new ObjectId(personaId) },
    {
      $set: {
        name: data.name,
        description: data.description ?? undefined,
        systemPrompt: data.system_prompt,
        voice: data.voice,
        icon: data.icon,
        updatedAt: new Date(),
      },
    },
  );
  return matchedCount > 0;
}

/**
 * Delete a custom persona (built-in personas cannot be deleted).
 */
export async function deletePersona(db: Db, personaId: string) {
  const { deletedCount } = await db
    .collection<MongoPersona>("personas")
    .deleteOne({ _id: new ObjectId(personaId), isBuiltIn: false });
  return deletedCount > 0;
}

/**
 * Get a single persona by ID.
 */
export async function getPersona(db: Db, personaId: string) {
  const doc = await db
    .collection<MongoPersona>("personas")
    .findOne({ _id: new ObjectId(personaId) });
  if (!doc) return null;
  return personaToRow(doc);
}
