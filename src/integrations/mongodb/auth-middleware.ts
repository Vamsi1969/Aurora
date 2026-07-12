/**
 * MongoDB authentication middleware for TanStack Start server functions.
 *
 * Verifies the Bearer JWT token from the request using the same JWT secret
 * that Supabase uses to sign its tokens (set MONGODB_JWT_SECRET to match
 * SUPABASE_JWT_SECRET), and attaches the authenticated userId and MongoDB
 * database instance to the server function context.
 *
 * Env vars required:
 *   MONGODB_URI          – MongoDB connection string
 *   MONGODB_DB           – Database name (defaults to "aurora")
 *   MONGODB_JWT_SECRET   – Must match Supabase's JWT secret for token verification
 */

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { verifyToken } from "./auth";
import { getDb } from "./client";

export interface MongoAuthContext {
  userId: string;
  db: Awaited<ReturnType<typeof getDb>>;
  email: string;
}

export const requireMongoAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Validate required env vars
  const MONGODB_URI = process.env.MONGODB_URI;
  const JWT_SECRET = process.env.MONGODB_JWT_SECRET || process.env.JWT_SECRET;

  if (!MONGODB_URI) {
    console.error("[MongoDB] MONGODB_URI is not set");
    throw new Error("Server configuration error: MONGODB_URI not configured");
  }

  if (!JWT_SECRET) {
    console.error("[MongoDB] MONGODB_JWT_SECRET (or JWT_SECRET) is not set");
    throw new Error("Server configuration error: JWT secret not configured");
  }

  // Extract Bearer token from request
  const request = getRequest();

  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new Error("Unauthorized: No authorization header provided");
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  if (token.split(".").length !== 3) {
    throw new Error("Unauthorized: Invalid token format");
  }

  // Verify the JWT token
  const user = verifyToken(token);
  if (!user) {
    throw new Error("Unauthorized: Invalid or expired token");
  }

  if (!user.sub) {
    throw new Error("Unauthorized: No user ID found in token");
  }

  // Get the MongoDB database instance
  const db = await getDb();

  return next({
    context: {
      userId: user.sub,
      email: user.email,
      db,
    } as MongoAuthContext,
  });
});
