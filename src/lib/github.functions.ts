import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    let lastCommit: GithubStatus extends { ok: true; lastCommit: infer C } ? C : never = null as never;
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

    const value: GithubStatus = { ok: true, repo, lastCommit };
    cache.set(key, { at: Date.now(), value });
    return value;
  });