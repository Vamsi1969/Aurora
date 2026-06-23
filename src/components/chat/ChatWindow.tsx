import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getThreadMessages } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import auroraMark from "@/assets/aurora-mark.png";
import { notifyThreadsChanged } from "./ChatShell";
import { toast } from "sonner";

type Row = { id: string; role: string; content: string; created_at: string };

function rowsToMessages(rows: Row[]): UIMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role as UIMessage["role"],
    parts: [{ type: "text", text: r.content }],
  }));
}

function textOf(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

export function ChatWindow({
  threadId,
  initialPrompt,
}: {
  threadId: string;
  initialPrompt?: string;
}) {
  const fetchMessages = useServerFn(getThreadMessages);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMessages({ data: { threadId } }).then((rows) => {
      if (cancelled) return;
      setInitialMessages(rowsToMessages(rows as Row[]));
    });
    return () => {
      cancelled = true;
    };
  }, [threadId, fetchMessages]);

  if (!initialMessages) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading conversation…
      </div>
    );
  }

  return (
    <ChatInner
      key={threadId}
      threadId={threadId}
      initialMessages={initialMessages}
      initialPrompt={initialPrompt}
    />
  );
}

function ChatInner({
  threadId,
  initialMessages,
  initialPrompt,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialPrompt?: string;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? "";
          return {
            body: { messages, threadId, ...body },
            headers: { Authorization: `Bearer ${token}` },
          };
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message ?? "Something went wrong"),
    onFinish: () => notifyThreadsChanged(),
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentInitialRef = useRef(false);

  const isLoading = status === "submitted" || status === "streaming";

  // Send initial prompt if provided.
  useEffect(() => {
    if (sentInitialRef.current) return;
    if (initialPrompt && messages.length === 0) {
      sentInitialRef.current = true;
      sendMessage({ text: initialPrompt });
    }
  }, [initialPrompt, messages.length, sendMessage]);

  // Auto-scroll.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Focus textarea.
  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  // Auto-grow textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [input]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto scroll-smooth"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="mx-auto max-w-3xl px-4 py-8">
          {messages.length === 0 && !isLoading && (
            <p className="text-center text-sm text-muted-foreground">
              Send a message to start the conversation.
            </p>
          )}
          <div className="space-y-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={textOf(m)} />
            ))}
            {status === "submitted" && <ThinkingRow />}
            {error && (
              <p className="text-sm text-destructive">
                {error.message || "Something went wrong."}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-background/60 px-4 py-4 backdrop-blur">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="relative rounded-2xl border border-border bg-card shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Message Aurora…"
              rows={1}
              className="block w-full resize-none rounded-2xl bg-transparent px-5 py-4 pr-14 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            {isLoading ? (
              <Button
                type="button"
                size="icon"
                onClick={stop}
                className="absolute right-2 bottom-2 size-9 rounded-full"
                variant="secondary"
                aria-label="Stop"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="absolute right-2 bottom-2 size-9 rounded-full"
                aria-label="Send"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Aurora can make mistakes. Verify important information.
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ role, text }: { role: string; text: string }) {
  if (role === "user") {
    return (
      <div className="msg-rise flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-secondary px-4 py-2.5 text-secondary-foreground shadow-sm">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="msg-rise flex gap-3">
      <img
        src={auroraMark}
        alt=""
        width={28}
        height={28}
        className="mt-0.5 size-7 shrink-0 rounded-full"
      />
      <div className={cn("min-w-0 flex-1 text-[15px] leading-relaxed", "prose-chat")}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
}

function ThinkingRow() {
  return (
    <div className="msg-rise flex items-center gap-3">
      <img src={auroraMark} alt="" width={28} height={28} className="size-7 rounded-full" />
      <span className="thinking-shimmer text-sm font-medium">Thinking…</span>
    </div>
  );
}