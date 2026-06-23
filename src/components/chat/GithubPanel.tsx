import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGithubStatus, type GithubStatus } from "@/lib/github.functions";
import { getProfile, updateProfile } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Github,
  Star,
  GitFork,
  GitBranch,
  RefreshCw,
  ExternalLink,
  Unplug,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function GithubPanel() {
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(updateProfile);
  const fetchStatus = useServerFn(getGithubStatus);
  const [url, setUrl] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (repoUrl: string) => {
      setLoading(true);
      try {
        const s = await fetchStatus({ data: { url: repoUrl } });
        setStatus(s);
      } finally {
        setLoading(false);
      }
    },
    [fetchStatus],
  );

  useEffect(() => {
    fetchProfile().then((p) => {
      const u = (p as { github_repo_url?: string | null })?.github_repo_url ?? null;
      setUrl(u);
      if (u) load(u);
    });
  }, [fetchProfile, load]);

  async function connect() {
    const v = input.trim();
    if (!v) return;
    setLoading(true);
    try {
      const s = await fetchStatus({ data: { url: v } });
      setStatus(s);
      if (!s.ok) {
        toast.error(s.error);
        return;
      }
      await saveProfile({ data: { github_repo_url: v } });
      setUrl(v);
      setInput("");
      toast.success("GitHub repo connected");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    await saveProfile({ data: { github_repo_url: null } });
    setUrl(null);
    setStatus(null);
    setInput("");
    toast.success("Disconnected");
  }

  if (!url) {
    return (
      <div className="space-y-2">
        <Label htmlFor="gh-url" className="flex items-center gap-2">
          <Github className="size-4" /> GitHub repository
        </Label>
        <div className="flex gap-2">
          <Input
            id="gh-url"
            placeholder="https://github.com/owner/repo"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                connect();
              }
            }}
          />
          <Button onClick={connect} disabled={loading || !input.trim()}>
            {loading ? "Checking…" : "Connect"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Public repos only. We poll the public GitHub API; no token required.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Github className="size-4 shrink-0" />
          <span className="text-sm font-medium">GitHub</span>
          {status?.ok ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <AlertCircle className="size-3" /> Unreachable
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => load(url)}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={disconnect}
            aria-label="Disconnect"
            title="Disconnect"
          >
            <Unplug className="size-3.5" />
          </Button>
        </div>
      </div>

      {status?.ok ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <a
              href={status.repo.html_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {status.repo.full_name}
              <ExternalLink className="size-3" />
            </a>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Star className="size-3" />
                {status.repo.stargazers_count}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitFork className="size-3" />
                {status.repo.forks_count}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3" />
                {status.repo.default_branch}
              </span>
            </div>
          </div>
          {status.repo.description && (
            <p className="text-xs text-muted-foreground">{status.repo.description}</p>
          )}
          {status.lastCommit && (
            <a
              href={status.lastCommit.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-border bg-background p-2 hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-[10px] text-muted-foreground">
                  {status.lastCommit.sha}
                </code>
                <span className="text-[10px] text-muted-foreground">
                  {timeAgo(status.lastCommit.date)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs">{status.lastCommit.message}</p>
              <p className="text-[10px] text-muted-foreground">
                by {status.lastCommit.author}
              </p>
            </a>
          )}
        </div>
      ) : (
        <p className="text-xs text-destructive">
          {status?.error ?? "Loading…"}
        </p>
      )}
    </div>
  );
}