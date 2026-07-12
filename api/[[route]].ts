/**
 * Vercel serverless function entry point for TanStack Start SSR.
 *
 * This catch-all handler delegates all incoming requests to the
 * TanStack Start server handler for proper SSR routing.
 * Falls back to the server fetch if Nitro Vercel preset doesn't
 * generate the .vercel/output/ directory structure.
 */
import server from "../src/server";

// Use Node.js runtime (SSR needs fs, crypto, etc.)
export const config = {
  runtime: "nodejs",
};

// Export the fetch handler for Vercel's Node.js runtime
export default server.fetch;
