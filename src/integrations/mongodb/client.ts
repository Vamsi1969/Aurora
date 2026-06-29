import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB = process.env.MONGODB_DB || "aurora";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Get a shared MongoDB client instance (connection-pooled).
 * Safe to call multiple times — reuses the same connection.
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;
  client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  await client.connect();
  return client;
}

/** Get the Aurora database instance. */
export async function getDb(): Promise<Db> {
  if (db) return db;
  const c = await getMongoClient();
  db = c.db(MONGODB_DB);
  return db;
}

/**
 * Create a MongoDB client authenticated with a user's JWT token.
 * Used for operations that need to respect per-user data isolation.
 */
export async function getUserDb(accessToken: string): Promise<Db> {
  const c = new MongoClient(MONGODB_URI, {
    auth: { username: "x-access-token", password: accessToken },
    maxPoolSize: 5,
  });
  await c.connect();
  return c.db(MONGODB_DB);
}
