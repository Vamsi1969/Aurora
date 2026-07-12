import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Search,
  Loader2,
  BookOpen,
  AlertTriangle,
  RefreshCw,
  Square,
  MessageCircle,
  History,
  Plus,
  Trash2,
} from "lucide-react";
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
  "What topics have I discussed most?",
  "Find conversations about programming",
  "Summarize my recent discussions",
  "What questions have I asked about AI?",
];

type ToolThread = { id: string; title: string; created_at: string; updated_at: string };

function rowsToMessages(rows: { id: string; role: string; content: string }[]) {
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: r.content }],
  }));
}

function SearchingIndicator() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Searching your knowledge base{dots}
    </div>
  );
}

export function RagSearchPanel() {
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ToolThread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchThreads = useServerFn(listToolThreads);
  const fetchMessages = useServerFn(loadToolThreadMessages);
  const deleteThread = useServerFn(deleteToolThread);
  const threadIdRef = useRef<string | null>(null);
  const lastQueryRef = useRef("");

  // Load thread list on mount
  useEffect(() => {
    fetchThreads({ data: { panelType: "rag" } })
      .then((data) => setThreads(data as ToolThread[]))
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoadingHistory(false));
  }, [fetchThreads]);

  const loadThread = useCallback(
    async (id: string) => {
      setThreadId(id);
      try {
        const rows = (await fetchMessages({ data: { threadId: id } })) as {
          id: string;
          role: string;
          content: string;
        }[];
        setMessages(rowsToMessages(rows));
      } catch {
        toast.error("Failed to load conversation");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchMessages],
  );

  const startNew = useCallback(() => {
    setThreadId(null);
    setMessages([]);
    lastQueryRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await deleteThread({ data: { threadId: id } });
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (threadId === id) {
          setThreadId(null);
          setMessages([]);
        }
      } catch {
        toast.error("Failed to delete conversation");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteThread, threadId],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/rag-query",
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          // Intercept X-Thread-Id header from response to track tool threads
          const newThreadId = response.headers.get("X-Thread-Id");
          if (newThreadId && newThreadId !== threadIdRef.current) {
            threadIdRef.current = newThreadId;
            setThreadId(newThreadId);
            fetchThreads({ data: { panelType: "rag" } })
              .then((data) => setThreads(data as ToolThread[]))
              .catch(() => {
                /* ignore */
              });
          }
          return response;
        },
        prepareSendMessagesRequest: async ({ messages }) => {
          // Get the last user message text directly (no JSON wrapping)
          const lastUser = [...messages]
            .reverse()
            .find(
              (m: { role: string; parts?: { type: string; text?: string }[] }) => m.role === "user",
            );
          const query = lastUser
            ? lastUser.parts
                ?.map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
                .join("") || ""
            : "";
          return {
            body: {
              query,
              // Pass the current context textarea value directly
              context: context.trim() || undefined,
              threadId: threadId ?? undefined,
            },
          };
        },
      }),
    [context, threadId, fetchThreads],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ transport });
  const isLoading = status === "submitted" || status === "streaming";

  const handleClear = () => {
    setThreadId(null);
    setMessages([]);
    lastQueryRef.current = "";
  };

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    lastQueryRef.current = text;
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });
    setInput("");
  };

  return (
    <div className="flex h-full">
      {/* History sidebar */}
      <div className="hidden w-64 shrink-0 border-r border-border/60 bg-muted/20 p-3 md:block">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <History className="size-4" /> History
          </span>
          <Button size="sm" variant="ghost" onClick={startNew} className="h-7 gap-1 px-2">
            <Plus className="size-3.5" /> New
          </Button>
        </div>
        {loadingHistory ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Loading…
          </div>
        ) : threads.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No searches yet</p>
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
                  {t.title.replace(/^\[rag\]\s*/, "")}
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
            <Search className="size-8 text-primary" /> Knowledge Search (RAG)
          </h1>
          <p className="text-muted-foreground">
            Search through your conversation history and get AI-powered answers with source
            citations.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4" /> Suggested Searches
            </CardTitle>
            <CardDescription>Click to search your knowledge base</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUERIES.map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(q)}
                  disabled={isLoading}
                >
                  {q}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="What would you like to know?"
              className="min-h-[80px]"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Textarea
              placeholder="Optional: Add context to narrow down the search..."
              className="min-h-[40px] text-sm"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
            <div className="flex gap-2">
              {isLoading ? (
                <Button onClick={stop} className="w-full gap-2">
                  <Square className="size-4 fill-current" /> Stop
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={!input.trim()} className="w-full">
                  <Search className="mr-2 size-4" /> Search Knowledge Base
                </Button>
              )}
              {messages.length > 0 && !isLoading && (
                <Button variant="outline" onClick={handleClear} className="gap-2">
                  <RefreshCw className="size-4" /> Clear
                </Button>
              )}
            </div>
          </div>

          {error && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Search failed</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {error.message || "Something went wrong. Please try again."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (lastQueryRef.current && !isLoading) {
                      sendMessage({
                        role: "user",
                        parts: [{ type: "text", text: lastQueryRef.current }],
                      });
                    }
                  }}
                  disabled={!lastQueryRef.current || isLoading}
                  className="shrink-0 gap-1.5"
                >
                  <RefreshCw className="size-3.5" /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {messages.filter((m) => m.role === "assistant").length > 0 && (
            <div className="space-y-4">
              {messages
                .filter((m) => m.role === "assistant")
                .map((msg) => {
                  const text = msg.parts
                    .map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
                    .join("");
                  const isStreaming = isLoading && messages[messages.length - 1]?.id === msg.id;
                  return (
                    <Card key={msg.id}>
                      <CardContent className="p-4">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          {text ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" /> Searching…
                            </span>
                          )}
                          {isStreaming && text && (
                            <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}

          {isLoading && messages.filter((m) => m.role === "assistant").length === 0 && (
            <SearchingIndicator />
          )}

          {!isLoading && messages.length === 0 && !error && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
              <MessageCircle className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Ask a question to search your conversation history.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
