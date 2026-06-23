import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Copy, Check, Code2, Download } from "lucide-react";

export type ArtifactSpec = {
  id: string;
  title: string;
  language: string;
  code: string;
};

const EXT: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  html: "html",
  css: "css",
  json: "json",
  tsx: "tsx",
  jsx: "jsx",
  bash: "sh",
  sh: "sh",
  sql: "sql",
};

export function extractArtifacts(text: string, messageId: string): ArtifactSpec[] {
  const out: ArtifactSpec[] = [];
  const re = /```([a-zA-Z0-9_+\-.]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "text").toLowerCase();
    const code = m[2];
    const lines = code.split("\n").length;
    if (lines >= 15 || code.length >= 600) {
      out.push({ id: `${messageId}-${i}`, title: titleFor(lang, code), language: lang, code });
    }
    i++;
  }
  return out;
}

function titleFor(lang: string, code: string): string {
  const first = code.split("\n").find((l) => l.trim().length > 0) ?? lang;
  const cleaned = first.replace(/[/#*\-<>]+/g, "").trim();
  return cleaned.slice(0, 60) || lang.toUpperCase();
}

export function ArtifactPanel({
  artifact,
  onClose,
}: {
  artifact: ArtifactSpec;
  onClose: () => void;
}) {
  const [code, setCode] = useState(artifact.code);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function download() {
    const ext = EXT[artifact.language] ?? "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, "_").slice(0, 40) || "artifact"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-xl">
      <header className="flex h-12 items-center gap-2 border-b border-border px-3">
        <Code2 className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{artifact.title}</div>
        <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {artifact.language}
        </span>
        <Button size="icon" variant="ghost" onClick={copy} className="size-8" aria-label="Copy">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={download} className="size-8" aria-label="Download">
          <Download className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} className="size-8" aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        className="flex-1 resize-none bg-background p-4 font-mono text-[13px] leading-relaxed outline-none"
      />
    </aside>
  );
}