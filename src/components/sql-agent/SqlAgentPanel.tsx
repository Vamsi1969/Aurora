import { useState, useMemo, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Database, Send, Loader2, Table, Code, AlertTriangle, RefreshCw, Square, MessageCircle, History, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useServerFn } from "@tanstack/react-start";
import { listToolThreads, loadToolThreadMessages, deleteToolThread } from "@/lib/tool-threads";

const SAMPLE_QUERIES = [
  "List all my conversation threads",
  "How many messages have I sent?",
  "Show me my most recent conversations",
  "What AI models have I used?",
  "Summarize my conversation activity",
];

type ToolThread = { id: string; title: string; created_at: string; updated_at: string };

function rowsToMessages(rows: { id: string; role: string; content: string }[]) {
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: r.content }],
  }));
}

export function SqlAgentPanel() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ToolThread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchThreads = useServerFn(listToolThreads);
  const fetchMessages = useServerFn(loadToolThreadMessages);
  const deleteThread = useServerFn(deleteToolThread);

  // Load thread list on mount
  useEffect(() => {
    fetchThreads({ data: { panelType: "sql" } })
      .then((data) => setThreads(data as ToolThread[]))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [fetchThreads]);

  const loadThread = useCallback(
    async (id: string) => {
      setThreadId(id);
      try {
        const rows = (await fetchMessages({ data: { threadId: id } })) as { id: string; role: string; content: string }[];
        setMessages(rowsToMessages(rows));
      } catch {
        toast.error("Failed to load conversation");
      }
    },
    [fetchMessages],
  );

  const startNew = useCallback(() => {
    setThreadId(null);
    setMessages([]);
  }, []);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await deleteThread({ data: { threadId: id } });
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (threadId === id) { setThreadId(null); setMessages([]); }
      } catch {
        toast.error("Failed to delete conversation");
      }
    },
    [deleteThread, threadId],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/sql-agent",
        prepareSendMessagesRequest: async ({ messages }) => {
          return {
            body: {
              messages: messages.map((m: UIMessage) => ({
                role: m.role,
                content: m.parts?.map((p) => p.type === "text" && "text" in p ? p.text : "").join("") || "",
              })),
              threadId: threadId ?? undefined,
            },
          };
        },
        onResponse: async (response) => {
          const newThreadId = response.headers.get("X-Thread-Id");
          if (newThreadId && newThreadId !== threadId) {
            setThreadId(newThreadId);
            fetchThreads({ data: { panelType: "sql" } }).then((data) => setThreads(data as ToolThread[])).catch(() => {});
          }
        },
      }),
    [threadId, fetchThreads],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ transport });
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
    setInput("");
  };

  const handleClear = () => {
    setThreadId(null);
    setMessages([]);
  };

  return (
    <div className="flex h-full">
      {/* History sidebar */}
      <div className="hidden w-64 shrink-0 border-r border-border/60 bg-muted/20 p-3 md:block">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium"><History className="size-4" /> History</span>
          <Button size="sm" variant="ghost" onClick={startNew} className="h-7 gap-1 px-2"><Plus className="size-3.5" /> New</Button>
        </div>
        {loadingHistory ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading…</div>
        ) : threads.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No queries yet</p>
        ) : (
          <div className="space-y-1">
            {threads.map((t) => (
              <div key={t.id} className="group relative">
                <button
                  onClick={() => loadThread(t.id)}
                  className={cn(
                    "w-full truncate rounded-md px-2.5 py-1.5 pr-7 text-left text-xs transition hover:bg-accent",
                    threadId === t.id ? "bg-accent font-medium" : "text-muted-foreground",
                  )}
                >
                  {t.title.replace(/^\[sql\]\s*/, "")}
                </button>
                <button
                  onClick={(e) => handleDelete(t.id, e)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  title="Delete conversation"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-4xl flex-1 space-y-6 p-6">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Database className="size-8 text-primary" /> SQL Agent
          </h1>
          <p className="text-muted-foreground">Ask questions about your data in natural language. The agent will query your database and provide insights.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Table className="size-4" /> Quick Queries</CardTitle>
            <CardDescription>Click a sample query to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUERIES.map((q) => (
                <Button key={q} variant="outline" size="sm" onClick={() => setInput(q)} disabled={isLoading}>{q}</Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Textarea placeholder="Ask a question about your data..." className="min-h-[80px] flex-1" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} />
            {isLoading ? (
              <Button onClick={stop} className="self-end gap-2">
                <Square className="size-4 fill-current" /> Stop
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!input.trim()} className="self-end">
                <Send className="size-4" />
              </Button>
            )}
            {messages.length > 0 && !isLoading && (
              <Button variant="outline" onClick={handleClear} className="self-end gap-2">
                <RefreshCw className="size-4" />
              </Button>
            )}
          </div>

          {error && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Query failed</p>
                  <p className="mt-1 text-xs text-muted-foreground">{error.message || "Something went wrong. Please try again."}</p>
                </div>
                <Button size="sm" variant="outline" onClick={handleSubmit} disabled={!input.trim()} className="shrink-0 gap-1.5">
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg) => {
                const text = msg.parts.map((p) => p.type === "text" && "text" in p ? p.text : "").join("");
                const isLastMessage = messages[messages.length - 1]?.id === msg.id;
                const isStreaming = isLoading && isLastMessage && msg.role === "assistant";
                const hasToolCalls = msg.parts.some((p) => p.type === "tool-invocation");
                return (
                  <Card key={msg.id} className={msg.role === "user" ? "ml-8" : "mr-8"}>
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Code className="size-4" />
                        <span className="text-sm font-medium">{msg.role === "user" ? "You" : "SQL Agent"}</span>
                        {isStreaming && (
                          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" /> Thinking…
                          </span>
                        )}
                      </div>
                      {hasToolCalls && (
                        <div className="mb-3 space-y-1">
                          {msg.parts.filter((p) => p.type === "tool-invocation").map((p, i) => {
                            const ti = p as unknown as { toolInvocation?: { toolName: string; state: string; result?: unknown } };
                            const inv = ti.toolInvocation;
                            if (!inv) return null;
                            const isExecuting = inv.state === "call" || inv.state === "partial-call";
                            const TOOL_LABELS: Record<string, string> = { executeSQL: "Executing query", listTables: "Listing tables", describeTable: "Describing table", getUserThreads: "Fetching threads", getThreadMessages: "Fetching messages" };
                            const toolLabel = TOOL_LABELS[inv.toolName] || inv.toolName;
                            return (
                              <div key={i} className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-1.5 text-xs">
                                {isExecuting ? (
                                  <Loader2 className="size-3 animate-spin text-primary" />
                                ) : (
                                  <span className="size-3 rounded-full bg-green-500/80" />
                                )}
                                <span className="text-muted-foreground">{toolLabel}…</span>
                                {inv.result && !isExecuting && (
                                  <span className="ml-auto text-green-600 dark:text-green-400">done</span>
                                )}
                                {inv.result && typeof inv.result === "object" && inv.result !== null && "error" in (inv.result as Record<string, unknown>) && (
                                  <span className="ml-auto text-destructive">error</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {text ? (
                          <>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                            {isStreaming && (
                              <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                            )}
                          </>
                        ) : isStreaming ? (
                          <span className="inline-flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Generating response…
                          </span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {isLoading && messages.filter((m) => m.role === "assistant").length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Querying your data…
            </div>
          )}

          {!isLoading && messages.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
              <MessageCircle className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Ask a question about your data to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
