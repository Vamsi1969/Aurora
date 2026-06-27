import { createFileRoute } from "@tanstack/react-router";
import { streamText, tool, zodSchema, stepCountIs } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";

const SQL_AGENT_SYSTEM = `You are Aurora SQL Agent. You query databases and provide insights. Only SELECT queries are allowed. Always use LIMIT. Format results in markdown.`;

const KNOWN_TABLES: Record<string, { columns: { name: string; type: string; description: string }[] }> = {
  threads: {
    columns: [
      { name: "id", type: "uuid", description: "Primary key" },
      { name: "title", type: "text", description: "Thread title" },
      { name: "model", type: "text", description: "AI model used" },
      { name: "persona_id", type: "uuid", description: "Associated persona" },
      { name: "user_id", type: "uuid", description: "Owner user ID" },
      { name: "created_at", type: "timestamptz", description: "Creation timestamp" },
      { name: "updated_at", type: "timestamptz", description: "Last update timestamp" },
    ],
  },
  messages: {
    columns: [
      { name: "id", type: "uuid", description: "Primary key" },
      { name: "thread_id", type: "uuid", description: "Parent thread" },
      { name: "user_id", type: "uuid", description: "Author user ID" },
      { name: "role", type: "text", description: "user or assistant" },
      { name: "content", type: "text", description: "Message content" },
      { name: "attachments", type: "jsonb", description: "File attachments" },
      { name: "created_at", type: "timestamptz", description: "Creation timestamp" },
    ],
  },
  profiles: {
    columns: [
      { name: "id", type: "uuid", description: "User ID" },
      { name: "display_name", type: "text", description: "Display name" },
      { name: "system_prompt", type: "text", description: "Custom system prompt" },
    ],
  },
  personas: {
    columns: [
      { name: "id", type: "uuid", description: "Primary key" },
      { name: "name", type: "text", description: "Persona name" },
      { name: "system_prompt", type: "text", description: "System prompt" },
    ],
  },
};

export const Route = createFileRoute("/api/sql-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY!;

        const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const userSupabase = createClient<Database>(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}`, apikey: supabasePublishable } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims, error: claimsErr } = await userSupabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        const body = (await request.json()) as {
          messages: { role: string; content: string }[];
          threadId?: string;
        };
        const { messages, threadId } = body;

        // Rate limit: 8 requests per minute per user
        const rl = checkRateLimit(`sql:${userId}`, { maxRequests: 8, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);
        const rateLimitHeaders = { "X-RateLimit-Remaining": String(rl.remaining) };

        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("Bad request", { status: 400 });
        }

        if (!process.env.LOVABLE_API_KEY) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        // Create thread if not provided
        let activeThreadId = threadId;
        if (!activeThreadId) {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const title = (lastUser?.content || "SQL query").slice(0, 60).replace(/\s+/g, " ").trim();
          const { data: thread } = await userSupabase
            .from("threads")
            .insert({ user_id: userId, title: `[sql] ${title}`, model: "tool-sql" })
            .select("id")
            .single();
          activeThreadId = thread?.id;
        }

        // Save user message
        if (activeThreadId) {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            await userSupabase.from("messages").insert({
              thread_id: activeThreadId,
              user_id: userId,
              role: "user",
              content: lastUser.content,
            });
          }
        }

        const gateway = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
        const model = gateway("google/gemini-2.5-pro");

        const result = streamText({
          model,
          system: SQL_AGENT_SYSTEM,
          messages: messages as any,
          tools: {
            executeSQL: tool({
              description: "Execute a read-only SQL SELECT query against the database.",
              inputSchema: zodSchema(z.object({
                query: z.string().describe("The SQL SELECT query to execute"),
                description: z.string().describe("Brief description of what this query does"),
              })),
              execute: async ({ query, description }: { query: string; description: string }) => {
                const normalized = query.trim().toUpperCase();
                if (!normalized.startsWith("SELECT") || normalized.includes("DROP") || normalized.includes("DELETE") || normalized.includes("UPDATE") || normalized.includes("INSERT")) {
                  return { error: "Only SELECT queries are allowed for safety." };
                }
                if (!normalized.includes("LIMIT")) {
                  query = query.trim().replace(/;$/, "") + " LIMIT 100;";
                }
                try {
                  const { data, error } = await supabase.rpc("exec_sql", { query_text: query });
                  if (error) {
                    return { error: `Query error: ${error.message}` };
                  }
                  return { result: data, description };
                } catch (err: unknown) {
                  return { error: `Execution error: ${(err as Error).message}` };
                }
              },
            }),
            listTables: tool({
              description: "List all tables in the database",
              inputSchema: zodSchema(z.object({})),
              execute: async () => {
                return { tables: Object.keys(KNOWN_TABLES).map((name) => ({ name, columns: KNOWN_TABLES[name].columns.length })) };
              },
            }),
            describeTable: tool({
              description: "Get the schema of a specific table",
              inputSchema: zodSchema(z.object({
                tableName: z.string().describe("The name of the table to describe"),
              })),
              execute: async ({ tableName }: { tableName: string }) => {
                return KNOWN_TABLES[tableName] || { error: `Unknown table: ${tableName}` };
              },
            }),
            getUserThreads: tool({
              description: "Get the current user's chat threads",
              inputSchema: zodSchema(z.object({})),
              execute: async () => {
                const { data, error } = await supabase.from("threads").select("id, title, model, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
                if (error) return { error: error.message };
                return { threads: data };
              },
            }),
            getThreadMessages: tool({
              description: "Get messages from a specific thread",
              inputSchema: zodSchema(z.object({
                threadId: z.string().describe("The thread ID"),
              })),
              execute: async ({ threadId }: { threadId: string }) => {
                const { data, error } = await supabase.from("messages").select("role, content, created_at").eq("thread_id", threadId).order("created_at").limit(50);
                if (error) return { error: error.message };
                return { messages: data };
              },
            }),
          },
          stopWhen: stepCountIs(5),
          onFinish: async ({ text }) => {
            if (text?.trim() && activeThreadId) {
              await userSupabase.from("messages").insert({
                thread_id: activeThreadId,
                user_id: userId,
                role: "assistant",
                content: text,
              });
            }
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as any,
          headers: { ...rateLimitHeaders, "X-Thread-Id": activeThreadId ?? "" },
        });
      },
    },
  },
});
