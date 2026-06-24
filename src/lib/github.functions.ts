import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GithubStatus =
  | { ok: false; error: string }
  | {
      ok: true;
      repo: {
        full_name: string;
        html_url: string;
        description: string | null;
        default_branch: string;
        stargazers_count: number;
        forks_count: number;
        private: boolean;
      };
      lastCommit: {
        sha: string;
        message: string;
        author: string;
        date: string;
        url: string;
      } | null;
      latestRun: {
        id: number;
        name: string;
        status: string; // queued | in_progress | completed | waiting | requested | pending
        conclusion: string | null; // success | failure | cancelled | skipped | timed_out | null
        event: string; // push | pull_request | workflow_dispatch | ...
        branch: string | null;
        created_at: string;
        updated_at: string;
        url: string;
      } | null;
    };

type CacheEntry = { at: number; value: GithubStatus };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  if (!s) return null;
  const cleaned = s
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  try {
    const u = cleaned.startsWith("http") ? new URL(cleaned) : new URL(`https://${cleaned}`);
    if (!/github\.com$/i.test(u.hostname)) return null;
    const [owner, repo] = u.pathname.replace(/^\//, "").split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

export const getGithubStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data }): Promise<GithubStatus> => {
    const parsed = parseRepo(data.url);
    if (!parsed) return { ok: false, error: "Not a valid GitHub repo URL." };
    const key = `${parsed.owner}/${parsed.repo}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "aurora-chat-app",
    };
    const repoRes = await fetch(`https://api.github.com/repos/${key}`, { headers });
    if (repoRes.status === 404) {
      const v: GithubStatus = { ok: false, error: "Repository not found or is private." };
      cache.set(key, { at: Date.now(), value: v });
      return v;
    }
    if (repoRes.status === 403) {
      return { ok: false, error: "GitHub rate limit reached. Try again in a minute." };
    }
    if (!repoRes.ok) {
      return { ok: false, error: `GitHub error (${repoRes.status}).` };
    }
    const repo = (await repoRes.json()) as {
      full_name: string;
      html_url: string;
      description: string | null;
      default_branch: string;
      stargazers_count: number;
      forks_count: number;
      private: boolean;
    };

    let lastCommit: GithubStatus extends { ok: true; lastCommit: infer C } ? C : never =
      null as never;
    try {
      const commitsRes = await fetch(
        `https://api.github.com/repos/${key}/commits?per_page=1&sha=${encodeURIComponent(
          repo.default_branch,
        )}`,
        { headers },
      );
      if (commitsRes.ok) {
        const arr = (await commitsRes.json()) as Array<{
          sha: string;
          html_url: string;
          commit: {
            message: string;
            author: { name: string; date: string } | null;
          };
        }>;
        const c = arr[0];
        if (c) {
          lastCommit = {
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split("\n")[0].slice(0, 200),
            author: c.commit.author?.name ?? "unknown",
            date: c.commit.author?.date ?? "",
            url: c.html_url,
          } as never;
        }
      }
    } catch {
      // ignore — commit lookup is best-effort
    }

    let latestRun: (GithubStatus & { ok: true })["latestRun"] = null;
    try {
      const runsRes = await fetch(`https://api.github.com/repos/${key}/actions/runs?per_page=1`, {
        headers,
      });
      if (runsRes.ok) {
        const json = (await runsRes.json()) as {
          workflow_runs?: Array<{
            id: number;
            name: string | null;
            status: string;
            conclusion: string | null;
            event: string;
            head_branch: string | null;
            created_at: string;
            updated_at: string;
            html_url: string;
          }>;
        };
        const r = json.workflow_runs?.[0];
        if (r) {
          latestRun = {
            id: r.id,
            name: r.name ?? "workflow",
            status: r.status,
            conclusion: r.conclusion,
            event: r.event,
            branch: r.head_branch,
            created_at: r.created_at,
            updated_at: r.updated_at,
            url: r.html_url,
          };
        }
      }
    } catch {
      // best-effort
    }

    const value: GithubStatus = { ok: true, repo, lastCommit, latestRun };
    // Shorter cache when a run is active, so the indicator stays live-ish.
    const isActive = latestRun && latestRun.status !== "completed";
    cache.set(key, {
      at: isActive ? Date.now() - (TTL_MS - 10_000) : Date.now(),
      value,
    });
    return value;
  });
