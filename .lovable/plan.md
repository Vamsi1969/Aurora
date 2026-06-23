Pushing to GitHub itself happens through Lovable's built-in GitHub integration (Plus (+) → GitHub → Connect project) — I can't run git or create repos from here. To make that connection useful immediately, I'll add a CI workflow so once the repo is connected, the Sync indicator in the GitHub panel lights up with real run status.

## Changes

- Add `.github/workflows/ci.yml`:
  - Triggers: `push` and `pull_request` on all branches.
  - Single job on `ubuntu-latest` using Bun (matches project tooling).
  - Steps: checkout → setup-bun → `bun install --frozen-lockfile` → `bunx tsgo --noEmit` → `bun run build`.
  - Workflow name: `CI` so it shows up cleanly in the panel.

## Out of scope

- No app code changes.
- No GitHub connection (you do that via the + menu in Lovable).
- No deploy/release workflow — only typecheck + build verification.
