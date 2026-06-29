/**
 * MongoDB Atlas App Services authentication helper.
 *
 * In production you would use Realm Web or the App Services token API.
 * For now we implement a lightweight JWT-based auth using MongoDB's
 * built-in email/password provider, since `realm-web` is deprecated.
 *
 * Env vars required:
 *   MONGODB_URI          – MongoDB connection string (srv://…)
 *   MONGODB_APP_ID       – Atlas App Services app ID
 *   MONGODB_API_KEY      – Atlas App Services API key (for admin ops)
 */

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.MONGODB_JWT_SECRET || process.env.JWT_SECRET || "";

export interface AuthUser {
  sub: string;   // MongoDB user ID
  email: string;
}

/**
 * Verify a Bearer token and return the authenticated user.
 * Tokens are signed JWTs produced by Atlas App Services auth.
 */
export function verifyToken(token: string): AuthUser | null {
  if (!JWT_SECRET) {
    console.warn("MONGODB_JWT_SECRET not set – auth disabled");
    return null;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Create a signed JWT for a newly authenticated user.
 * Called after successful login/signup.
 */
export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}
