import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FileText, Upload, Sparkles, Target, ArrowUpCircle, Loader2, AlertTriangle, RefreshCw, Square, MessageCircle, History, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useServerFn } from "@tanstack/react-start";
import { listToolThreads, loadToolThreadMessages, deleteToolThread } from "@/lib/tool-threads";

const ANALYSIS_TYPES = [
  {
    id: "analyze" as const,
    label: "Analyze Resume",
    description: "Get a detailed analysis of your resume with scores and improvement suggestions",
    icon: Sparkles,
  },
  {
    id: "match" as const,
    label: "Match to Job",
    description: "Compare your resume against a specific job description for match score",
    icon: Target,
  },
  {
    id: "enhance" as const,
    label: "Enhance Resume",
    description: "Get an improved version of your resume with ATS optimization",
    icon: ArrowUpCircle,
  },
];

type ToolThread = { id: string; title: string; created_at: string; updated_at: string };

function rowsToMessages(rows: { id: string; role: string; content: string }[]) {
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: r.content }],
  }));
}

export function ResumeAnalyzer() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analysisType, setAnalysisType] = useState<"analyze" | "match" | "enhance">("analyze");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ToolThread[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchThreads = useServerFn(listToolThreads);
  const fetchMessages = useServerFn(loadToolThreadMessages);
  const deleteThread = useServerFn(deleteToolThread);
  const threadIdRef = useRef<string | null>(null);

  // Load thread list on mount
  useEffect(() => {
    fetchThreads({ data: { panelType: "resume" } })
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
        api: "/api/resume-analysis",
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          // Intercept X-Thread-Id header from response to track tool threads
          const newThreadId = response.headers.get("X-Thread-Id");
          if (newThreadId && newThreadId !== threadIdRef.current) {
            threadIdRef.current = newThreadId;
            setThreadId(newThreadId);
            fetchThreads({ data: { panelType: "resume" } }).then((data) => setThreads(data as ToolThread[])).catch(() => {});
          }
          return response;
        },
        prepareSendMessagesRequest: async ({ messages }) => {
          const lastUser = [...messages].reverse().find((m: { role: string; parts?: { type: string; text?: string }[] }) => m.role === "user");
          const content = lastUser ? (lastUser.parts?.map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : "")).join("") || "") : "";
          let parsed: any = {};
          try { parsed = JSON.parse(content); } catch { parsed = { resumeText: content }; }
          return {
            body: {
              resumeText: parsed.resumeText || resumeText,
              jobDescription: parsed.jobDescription || jobDescription,
              analysisType,
              threadId: threadId ?? undefined,
            },
          };
        },
      }),
    [resumeText, jobDescription, analysisType, threadId, fetchThreads],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ transport });
  const isLoading = status === "submitted" || status === "streaming";

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt") && file.type !== "text/plain") {
      toast.error("Please upload a .txt file for now.");
      return;
    }
    const text = await file.text();
    setResumeText(text);
    toast.success("Resume loaded!");
  };

  const handleAnalyze = () => {
    if (!resumeText.trim()) { toast.error("Please paste your resume first"); return; }
    if (analysisType === "match" && !jobDescription.trim()) { toast.error("Please paste the job description"); return; }
    sendMessage({ role: "user", parts: [{ type: "text", text: JSON.stringify({ resumeText, jobDescription, analysisType }) }] });
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
          <p className="py-4 text-center text-xs text-muted-foreground">No analyses yet</p>
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
                  {t.title.replace(/^\[resume\]\s*/, "")}
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
            <FileText className="size-8 text-primary" />
            Resume Analyzer
          </h1>
          <p className="text-muted-foreground">Upload your resume and get AI-powered analysis, job matching, and enhancement suggestions.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {ANALYSIS_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <button key={type.id} onClick={() => setAnalysisType(type.id)}
                className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all ${analysisType === type.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50 hover:bg-muted/50"}`}>
                <Icon className={`size-5 ${analysisType === type.id ? "text-primary" : "text-muted-foreground"}`} />
                <div><div className="font-medium">{type.label}</div><div className="mt-1 text-xs text-muted-foreground">{type.description}</div></div>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="size-4" /> Your Resume</CardTitle>
            <CardDescription>Paste your resume text or upload a .txt file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="cursor-pointer inline-block">
              <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
              <Button variant="outline" size="sm"><Upload className="mr-2 size-4" /> Upload .txt</Button>
            </label>
            <Textarea placeholder="Paste your resume text here..." className="min-h-[200px] font-mono text-sm" value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
          </CardContent>
        </Card>

        {(analysisType === "match" || analysisType === "enhance") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="size-4" /> Job Description</CardTitle>
              <CardDescription>{analysisType === "match" ? "Paste the job posting to compare against" : "Optional: paste a job description for targeted enhancement"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea placeholder="Paste the job description here..." className="min-h-[150px] font-mono text-sm" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          {isLoading ? (
            <Button onClick={stop} size="lg" className="w-full gap-2">
              <Square className="size-4 fill-current" /> Stop Analysis
            </Button>
          ) : (
            <Button onClick={handleAnalyze} disabled={!resumeText.trim()} size="lg" className="w-full">
              <Sparkles className="mr-2 size-4" /> {ANALYSIS_TYPES.find((t) => t.id === analysisType)?.label}
            </Button>
          )}
          {messages.length > 0 && !isLoading && (
            <Button variant="outline" size="lg" onClick={handleClear} className="gap-2">
              <RefreshCw className="size-4" /> Clear
            </Button>
          )}
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Analysis failed</p>
                <p className="mt-1 text-xs text-muted-foreground">{error.message || "Something went wrong. Please try again."}</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={!resumeText.trim()} className="shrink-0 gap-1.5">
                <RefreshCw className="size-3.5" /> Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Analyzing your resume…
          </div>
        )}

        {messages.filter((m) => m.role === "assistant").length > 0 && (
          <Card>
            <CardHeader><CardTitle>Analysis Results</CardTitle></CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {messages.filter((m) => m.role === "assistant").map((msg) => {
                  const text = msg.parts.map((p: { type: string; text?: string }) => p.type === "text" ? p.text : "").join("");
                  const isStreaming = isLoading && messages[messages.length - 1]?.id === msg.id;
                  return (
                    <div key={msg.id} className="whitespace-pre-wrap">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      {isStreaming && text && (
                        <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && messages.filter((m) => m.role === "assistant").length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-6 py-10 text-center">
            <MessageCircle className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Upload your resume and select an analysis type to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
