import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";

const RAG_SYSTEM = `You are Aurora RAG Assistant — an expert at finding and synthesizing information from your knowledge base.

Your capabilities:
1. Search through conversation history for relevant information
2. Find related threads and messages
3. Synthesize information from multiple sources
4. Provide accurate answers with source citations

When answering:
- Always cite your sources (thread titles, message references)
- Be concise but thorough
- If you can't find relevant information, say so clearly
- Use markdown formatting for clarity`;

export const Route = createFileRoute("/api/rag-query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY!;

        const supabase = createClient<Database>(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}`, apikey: supabasePublishable } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        // supabase already uses the user's token, so RLS is enforced on all reads/writes
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        const body = (await request.json()) as {
          query: string;
          context?: string;
          threadId?: string;
        };
        const { query, context, threadId } = body;

        // Rate limit: 10 queries per minute per user
        const rl = checkRateLimit(`rag:${userId}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);
        const rateLimitHeaders = { "X-RateLimit-Remaining": String(rl.remaining) };

        if (!query?.trim()) {
          return new Response("Query is required", { status: 400 });
        }

        if (!process.env.LOVABLE_API_KEY) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        // Create thread if not provided
        let activeThreadId = threadId;
        if (!activeThreadId) {
          const title = query.slice(0, 60).replace(/\s+/g, " ").trim();
          const { data: thread } = await supabase
            .from("threads")
            .insert({ user_id: userId, title: `[rag] ${title}`, model: "tool-rag" })
            .select("id")
            .single();
          activeThreadId = thread?.id;
        }

        // Save user message
        if (activeThreadId) {
          await supabase.from("messages").insert({
            thread_id: activeThreadId,
            user_id: userId,
            role: "user",
            content: query,
          });
        }

        // Search for relevant content in the user's conversation history
        const { data: searchResults } = await supabase
          .from("messages")
          .select("content, thread_id, created_at, threads!inner(title, user_id)")
          .eq("threads.user_id", userId)
          .textSearch("content", query, { type: "websearch" })
          .limit(10);

        // Get recent threads for context
        const { data: recentThreads } = await supabase
          .from("threads")
          .select("id, title, created_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(5);

        // Build context from search results
        let contextBlock = "";
        if (searchResults && searchResults.length > 0) {
          contextBlock += "\n\nRelevant conversation history found:\n";
          for (const result of searchResults) {
            const title = (result as any).threads?.title || "Untitled";
            contextBlock += `\n[Thread: ${title}]\n${result.content}\n---\n`;
          }
        }

        if (recentThreads && recentThreads.length > 0) {
          contextBlock += "\n\nRecent conversations:\n";
          for (const thread of recentThreads) {
            contextBlock += `- ${thread.title}\n`;
          }
        }

        if (context) {
          contextBlock += `\n\nAdditional context provided:\n${context}`;
        }

        const gateway = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
        const model = gateway("google/gemini-2.5-pro");

        const userMessage = contextBlock
          ? `Query: ${query}\n\nContext from knowledge base:${contextBlock}`
          : `Query: ${query}`;

        const result = streamText({
          model,
          system: RAG_SYSTEM,
          messages: [{ role: "user", content: userMessage }],
          onFinish: async ({ text }) => {
            if (text?.trim() && activeThreadId) {
              await supabase.from("messages").insert({
                thread_id: activeThreadId,
                user_id: userId,
                role: "assistant",
                content: text,
              });
            }
          },
        });

        return result.toUIMessageStreamResponse({
          headers: { ...rateLimitHeaders, "X-Thread-Id": activeThreadId ?? "" },
        });
      },
    },
  },
});
