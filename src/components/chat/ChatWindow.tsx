import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  dropLastAssistant,
  getThreadMessages,
  getThreadMeta,
  saveImageGeneration,
  truncateFromMessage,
  suggestFollowups,
  updateThreadModel,
} from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  Square,
  Paperclip,
  ImagePlus,
  X,
  RefreshCw,
  Pencil,
  Copy,
  Check,
  Mic,
  Share2,
  FileText,
  Code2,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import auroraMark from "@/assets/aurora-mark.png";
import { notifyThreadsChanged } from "./ChatShell";
import { toast } from "sonner";
import { streamImage } from "@/lib/stream-image";
import { useVoiceInput } from "@/lib/use-voice-input";
import { ShareDialog } from "./ShareDialog";
import { ArtifactPanel, extractArtifacts, type ArtifactSpec } from "./Artifact";

type Attachment = {
  kind: "image" | "file";
  url: string;
  name?: string;
  mediaType?: string;
};
type Row = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  attachments: unknown;
};

function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is Attachment =>
      !!a &&
      typeof a === "object" &&
      ((a as Attachment).kind === "image" || (a as Attachment).kind === "file"),
  );
}

function rowsToMessages(rows: Row[]): UIMessage[] {
  return rows.map((r) => {
    const atts = parseAttachments(r.attachments);
    const parts: UIMessage["parts"] = [];
    if (r.content) parts.push({ type: "text", text: r.content });
    for (const a of atts) {
      parts.push({
        type: "file",
        url: a.url,
        mediaType: a.mediaType ?? (a.kind === "file" ? "application/pdf" : "image/png"),
      });
    }
    if (parts.length === 0) parts.push({ type: "text", text: "" });
    return { id: r.id, role: r.role as UIMessage["role"], parts };
  });
}

const MODELS: { id: string; label: string; hint: string }[] = [
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", hint: "Fast · default" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Deeper reasoning" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced" },
  { id: "openai/gpt-5", label: "GPT-5", hint: "Most capable" },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", hint: "Fast OpenAI" },
];

function textOf(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}
function imagesOf(m: UIMessage): string[] {
  return m.parts
    .map((p) =>
      p.type === "file" &&
      typeof p.url === "string" &&
      (!("mediaType" in p) || (p.mediaType ?? "").startsWith("image"))
        ? p.url
        : null,
    )
    .filter((u): u is string => !!u);
}

async function downloadUrl(url: string, filename: string) {
  try {
    let blobUrl = url;
    let revoke = false;
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      blobUrl = URL.createObjectURL(blob);
      revoke = true;
    }
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (e) {
    console.error(e);
    toast.error("Couldn't download file");
  }
}
function filesOf(m: UIMessage): { url: string; name: string }[] {
  const out: { url: string; name: string }[] = [];
  for (const p of m.parts) {
    if (
      p.type === "file" &&
      typeof p.url === "string" &&
      "mediaType" in p &&
      !(p.mediaType ?? "").startsWith("image")
    ) {
      const name = (p as { filename?: string }).filename ?? "Attachment";
      out.push({ url: p.url, name });
    }
  }
  return out;
}

export function ChatWindow({
  threadId,
  initialPrompt,
}: {
  threadId: string;
  initialPrompt?: string;
}) {
  const fetchMessages = useServerFn(getThreadMessages);
  const fetchMeta = useServerFn(getThreadMeta);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [initialModel, setInitialModel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMessages({ data: { threadId } }), fetchMeta({ data: { threadId } })]).then(
      ([rows, meta]) => {
        if (cancelled) return;
        setInitialMessages(rowsToMessages(rows as Row[]));
        setInitialModel(
          (meta as { model?: string } | null)?.model ?? "google/gemini-3-flash-preview",
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [threadId, fetchMessages, fetchMeta]);

  if (!initialMessages || !initialModel) {
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
      initialModel={initialModel}
      initialPrompt={initialPrompt}
    />
  );
}

function ChatInner({
  threadId,
  initialMessages,
  initialModel,
  initialPrompt,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialModel: string;
  initialPrompt?: string;
}) {
  const pendingAttachmentsRef = useRef<Attachment[]>([]);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? "";
          const attachments = pendingAttachmentsRef.current;
          pendingAttachmentsRef.current = [];
          return {
            body: { messages, threadId, attachments, ...body },
            headers: { Authorization: `Bearer ${token}` },
          };
        },
      }),
    [threadId],
  );

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message ?? "Something went wrong"),
    onFinish: () => notifyThreadsChanged(),
  });

  const [input, setInput] = useState("");
  const [model, setModel] = useState(initialModel);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [imageMode, setImageMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactSpec | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentInitialRef = useRef(false);
  const voice = useVoiceInput((t) => setInput(t));

  const persistModel = useServerFn(updateThreadModel);
  const dropLast = useServerFn(dropLastAssistant);
  const truncate = useServerFn(truncateFromMessage);
  const saveImage = useServerFn(saveImageGeneration);
  const suggest = useServerFn(suggestFollowups);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [suggestingId, setSuggestingId] = useState<string | null>(null);

  const isLoading = status === "submitted" || status === "streaming" || generating;

  const onModelChange = useCallback(
    (next: string) => {
      setModel(next);
      persistModel({ data: { id: threadId, model: next } }).catch(() =>
        toast.error("Couldn't save model choice"),
      );
    },
    [persistModel, threadId],
  );

  // Send initial prompt if provided.
  useEffect(() => {
    if (sentInitialRef.current) return;
    if (initialPrompt && messages.length === 0) {
      sentInitialRef.current = true;
      sendMessage({ text: initialPrompt });
    }
  }, [initialPrompt, messages.length, sendMessage]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [input]);

  // Generate follow-up suggestions after each assistant reply finishes streaming.
  useEffect(() => {
    if (status !== "ready") return;
    if (messages.length < 2) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    if (suggestions[last.id] || suggestingId === last.id) return;
    const assistantText = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    if (!assistantText) return;
    const prevUser = [...messages.slice(0, -1)].reverse().find((m) => m.role === "user");
    const userText = prevUser
      ? prevUser.parts
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("")
          .trim()
      : "";
    setSuggestingId(last.id);
    suggest({ data: { userText, assistantText } })
      .then((res) => {
        const list = (res as { suggestions?: string[] })?.suggestions ?? [];
        if (list.length > 0) {
          setSuggestions((prev) => ({ ...prev, [last.id]: list }));
        }
      })
      .catch(() => {})
      .finally(() => setSuggestingId((id) => (id === last.id ? null : id)));
  }, [status, messages, suggest, suggestions, suggestingId]);

  async function doImageGeneration(prompt: string) {
    setGenerating(true);
    const tmpUserId = `tmp-u-${Date.now()}`;
    const tmpAssistantId = `tmp-a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tmpUserId, role: "user", parts: [{ type: "text", text: `/image ${prompt}` }] },
      {
        id: tmpAssistantId,
        role: "assistant",
        parts: [{ type: "text", text: "Generating image…" }],
      },
    ]);
    let finalUrl = "";
    try {
      await streamImage(prompt, (dataUrl, isFinal) => {
        finalUrl = dataUrl;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tmpAssistantId
              ? {
                  ...m,
                  parts: [
                    { type: "text", text: isFinal ? "" : "Generating…" },
                    { type: "file", url: dataUrl, mediaType: "image/png" },
                  ],
                }
              : m,
          ),
        );
      });
      if (finalUrl) {
        await saveImage({ data: { threadId, prompt, imageDataUrl: finalUrl } });
        notifyThreadsChanged();
      }
    } catch (e) {
      toast.error((e as Error).message);
      setMessages((prev) => prev.filter((m) => m.id !== tmpUserId && m.id !== tmpAssistantId));
    } finally {
      setGenerating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    const slashMatch = text.match(/^\/image\s+(.+)$/i);
    if (imageMode || slashMatch) {
      const prompt = slashMatch ? slashMatch[1] : text;
      setInput("");
      setImageMode(false);
      doImageGeneration(prompt);
      return;
    }
    pendingAttachmentsRef.current = attachments;
    sendMessage({ text });
    setInput("");
    setAttachments([]);
  }

  async function handleAttach(files: FileList | null) {
    if (!files) return;
    const out: Attachment[] = [];
    for (const f of Array.from(files)) {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast.error(`${f.name}: only images and PDFs supported`);
        continue;
      }
      const cap = isPdf ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
      if (f.size > cap) {
        toast.error(`${f.name}: file too large`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      out.push({
        kind: isImage ? "image" : "file",
        url: dataUrl,
        name: f.name,
        mediaType: f.type,
      });
    }
    setAttachments((prev) => [...prev, ...out].slice(0, 6));
  }

  async function handleRegenerate() {
    if (isLoading) return;
    const roles = messages.map((m) => m.role);
    const lastAssistantIdx = roles.lastIndexOf("assistant");
    if (lastAssistantIdx < 0) return;
    const lastUserBefore = [...messages.slice(0, lastAssistantIdx)]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserBefore) return;
    try {
      await dropLast({ data: { threadId } });
      const beforeUser = messages.slice(
        0,
        messages.findIndex((m) => m.id === lastUserBefore.id),
      );
      setMessages(beforeUser);
      sendMessage({ text: textOf(lastUserBefore) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleEdit(messageId: string, newText: string) {
    if (!newText.trim() || isLoading) return;
    try {
      await truncate({ data: { threadId, messageId } });
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      setMessages(messages.slice(0, idx));
      sendMessage({ text: newText.trim() });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex h-full flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-end border-b border-border/60 px-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShareOpen(true)}
            className="gap-1.5"
          >
            <Share2 className="size-4" /> Share
          </Button>
        </div>
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
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                return (
                  <MessageBubble
                    key={m.id}
                    id={m.id}
                    role={m.role}
                    text={textOf(m)}
                    images={imagesOf(m)}
                    files={filesOf(m)}
                    isLast={isLast}
                    isLoading={isLoading}
                    onRegenerate={handleRegenerate}
                    onEdit={handleEdit}
                    onOpenArtifact={setActiveArtifact}
                  />
                );
              })}
              {(status === "submitted" || generating) && (
                <ThinkingRow label={generating ? "Generating image…" : "Thinking…"} />
              )}
              {status === "ready" &&
                (() => {
                  const last = messages[messages.length - 1];
                  if (!last || last.role !== "assistant") return null;
                  const list = suggestions[last.id];
                  if (!list || list.length === 0) return null;
                  return (
                    <div className="pl-10">
                      <div className="mb-1.5 flex items-center gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Suggested follow-ups
                        </p>
                        <button
                          type="button"
                          disabled={isLoading || suggestingId === last.id}
                          onClick={() =>
                            setSuggestions((prev) => {
                              const next = { ...prev };
                              delete next[last.id];
                              return next;
                            })
                          }
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
                          aria-label="Regenerate suggestions"
                          title="Regenerate suggestions"
                        >
                          <RefreshCw
                            className={cn("size-3", suggestingId === last.id && "animate-spin")}
                          />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {list.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={isLoading}
                            onClick={() => sendMessage({ text: s })}
                            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:bg-accent disabled:opacity-50"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
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
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    className="relative flex items-center overflow-hidden rounded-lg border border-border"
                  >
                    {a.kind === "image" ? (
                      <img src={a.url} alt="" className="size-16 object-cover" />
                    ) : (
                      <div className="flex h-16 items-center gap-2 bg-muted px-3 pr-8 text-xs">
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="max-w-[160px] truncate">{a.name ?? "PDF"}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground"
                      aria-label="Remove"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                placeholder={imageMode ? "Describe an image to generate…" : "Message Aurora…"}
                rows={1}
                className="block w-full resize-none rounded-2xl bg-transparent px-5 pt-4 pb-14 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
              />
              <div className="absolute inset-x-2 bottom-2 flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleAttach(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach image or PDF"
                  title="Attach image or PDF"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={imageMode ? "default" : "ghost"}
                  className="size-8"
                  onClick={() => setImageMode((v) => !v)}
                  aria-label="Image generation mode"
                  title="Generate an image"
                >
                  <ImagePlus className="size-4" />
                </Button>
                {voice.supported && (
                  <Button
                    type="button"
                    size="icon"
                    variant={voice.listening ? "default" : "ghost"}
                    className="size-8"
                    onClick={voice.toggle}
                    aria-label={voice.listening ? "Stop dictation" : "Start dictation"}
                    title={voice.listening ? "Stop dictation" : "Dictate"}
                  >
                    <Mic className={cn("size-4", voice.listening && "animate-pulse")} />
                  </Button>
                )}
                <Select value={model} onValueChange={onModelChange}>
                  <SelectTrigger className="ml-1 h-8 w-auto gap-1 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-accent focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {MODELS.map((mo) => (
                      <SelectItem key={mo.id} value={mo.id}>
                        <span className="font-medium">{mo.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{mo.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                {isLoading ? (
                  <Button
                    type="button"
                    size="icon"
                    onClick={stop}
                    className="size-9 rounded-full"
                    variant="secondary"
                    aria-label="Stop"
                  >
                    <Square className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!input.trim() && attachments.length === 0}
                    className="size-9 rounded-full"
                    aria-label="Send"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Aurora can make mistakes. Verify important information.
            </p>
          </form>
        </div>
      </div>
      {activeArtifact && (
        <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />
      )}
      <ShareDialog threadId={threadId} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

function MessageBubble({
  id,
  role,
  text,
  images,
  files,
  isLast,
  isLoading,
  onRegenerate,
  onEdit,
  onOpenArtifact,
}: {
  id: string;
  role: string;
  text: string;
  images: string[];
  files: { url: string; name: string }[];
  isLast: boolean;
  isLoading: boolean;
  onRegenerate: () => void;
  onEdit: (id: string, text: string) => void;
  onOpenArtifact: (a: ArtifactSpec) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);
  const artifacts = role === "assistant" ? extractArtifacts(text, id) : [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  if (role === "user") {
    return (
      <div className="msg-rise group flex flex-col items-end gap-1">
        {images.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {images.map((u, i) => (
              <div key={i} className="group/img relative">
                <img
                  src={u}
                  alt=""
                  className="max-h-60 rounded-xl border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => downloadUrl(u, `image-${i + 1}.png`)}
                  className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1.5 text-foreground opacity-0 shadow-sm backdrop-blur transition hover:bg-background group-hover/img:opacity-100"
                  aria-label="Download image"
                  title="Download image"
                >
                  <Download className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {files.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => downloadUrl(f.url, f.name || `file-${i + 1}.pdf`)}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="max-w-[200px] truncate">{f.name}</span>
                <Download className="size-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        {editing ? (
          <div className="w-full max-w-[85%] space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-card p-3 text-[15px] outline-none focus:ring-2 focus:ring-ring/40"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(text);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(false);
                  onEdit(id, draft);
                }}
                disabled={!draft.trim() || draft.trim() === text.trim()}
              >
                Send
              </Button>
            </div>
          </div>
        ) : (
          text && (
            <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-secondary px-4 py-2.5 text-secondary-foreground shadow-sm">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
            </div>
          )
        )}
        {!editing && (
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={copy}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              aria-label="Copy"
              title="Copy"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
            <button
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
              disabled={isLoading}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
              aria-label="Edit"
              title="Edit message"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="msg-rise group flex gap-3">
      <img
        src={auroraMark}
        alt=""
        width={28}
        height={28}
        className="mt-0.5 size-7 shrink-0 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className={cn("text-[15px] leading-relaxed", "prose-chat")}>
          {text && <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
        </div>
        {images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((u, i) => (
              <div key={i} className="group/img relative">
                <img
                  src={u}
                  alt=""
                  className="max-h-96 rounded-xl border border-border object-contain"
                />
                <button
                  type="button"
                  onClick={() => downloadUrl(u, `aurora-image-${i + 1}.png`)}
                  className="absolute right-2 top-2 rounded-md bg-background/85 p-1.5 text-foreground opacity-0 shadow-sm backdrop-blur transition hover:bg-background group-hover/img:opacity-100"
                  aria-label="Download image"
                  title="Download image"
                >
                  <Download className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {artifacts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {artifacts.map((a) => (
              <button
                key={a.id}
                onClick={() => onOpenArtifact(a)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
              >
                <Code2 className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground">{a.language}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={copy}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Copy"
            title="Copy"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          {isLast && (
            <button
              onClick={onRegenerate}
              disabled={isLoading}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
              aria-label="Regenerate"
              title="Regenerate"
            >
              <RefreshCw className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingRow({ label }: { label: string }) {
  return (
    <div className="msg-rise flex items-center gap-3">
      <img src={auroraMark} alt="" width={28} height={28} className="size-7 rounded-full" />
      <span className="thinking-shimmer text-sm font-medium">{label}</span>
    </div>
  );
}
