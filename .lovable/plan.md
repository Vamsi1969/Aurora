## What you get

A new **GitHub** section in the sidebar Settings dialog. You paste a public repo URL once (e.g. `https://github.com/Vamsi1969/Aurora`). The app saves it to your profile, calls the public GitHub API, and renders a status card:

- ✅ Connected / ❌ Not found / 🔒 Private (treated as not visible)
- Repo full name, description, default branch
- Last commit message + author + relative timestamp
- Star and fork counts
- Link to open the repo on github.com
- Refresh button + "Disconnect" button

All read-only, no token required. Only public repos are visible.

## Steps

1. **DB** — add `github_repo_url text` column to `public.profiles` (nullable). No new policies needed; existing "own profile" RLS covers it.

2. **Server function** — `getGithubStatus({ url })` in `src/lib/github.functions.ts`:
   - Parses the URL into `{owner, repo}`.
   - Fetches `https://api.github.com/repos/{owner}/{repo}` and `…/commits?per_page=1` from the server (avoids CORS + browser rate-limit headers).
   - Returns `{ ok, repo?, lastCommit?, error? }`.
   - Caches result in-memory for 60s per repo to stay under GitHub's 60 req/hr unauthenticated limit.

3. **Profile fns** — extend `updateProfile` to accept `github_repo_url` and `getProfile` to return it.

4. **UI** — new `GithubPanel` component used inside `SettingsDialog`:
   - If no URL saved: input + "Connect" button.
   - If URL saved: status card (see above), refresh, disconnect.
   - Uses `useServerFn` and shows toast errors for invalid URL / 404 / rate limit.

5. **Types** — regenerate Supabase types after the migration so `profiles.github_repo_url` is typed.

## Technical notes

- Endpoint: `GET https://api.github.com/repos/{owner}/{repo}` returns `{ full_name, description, default_branch, stargazers_count, forks_count, html_url, private }`. If `private: true` we surface "Repo is private — only public repos are supported".
- Last commit: `GET …/commits?per_page=1&sha={default_branch}` → `[0].commit.message`, `…author.name`, `…author.date`.
- URL parse accepts `https://github.com/owner/repo`, with/without `.git`, trailing slashes.
- Errors mapped: 404 → "Repository not found or is private", 403 → "GitHub rate limit reached, try again in a minute", network → generic.
- The cache is per server instance; that's fine for a 60s TTL.

Files touched/added:
- `supabase/migrations/<ts>_github_repo_url.sql` (new)
- `src/lib/chat.functions.ts` (extend profile fns)
- `src/lib/github.functions.ts` (new)
- `src/components/chat/GithubPanel.tsx` (new)
- `src/components/chat/SettingsDialog.tsx` (mount panel)
- `src/integrations/supabase/types.ts` (regenerated)
