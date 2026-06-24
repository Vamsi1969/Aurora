## Problem

The GitHub Actions CI job is failing on the **Lint** step with 121 Prettier formatting errors across 10 files (mostly missing semicolons and stray whitespace). The "Node.js 20 deprecation" message in the log is just an informational warning from `actions/checkout@v4` and is **not** what's failing the build.

Files with violations:
- `src/components/chat/Artifact.tsx`, `ChatShell.tsx`, `ChatWindow.tsx`
- `src/components/ui/badge.tsx`, `button.tsx`, `form.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `toggle.tsx`
- `src/integrations/supabase/types.ts` (auto-generated)

## Fix

1. Run `bunx prettier --write` on the offending files to auto-format them — this resolves all 121 errors in one shot.
2. Add `src/integrations/supabase/types.ts` to `.prettierignore` so the auto-generated file doesn't get re-flagged the next time it regenerates.
3. Re-run `bun run lint` to confirm zero errors.
4. (Optional polish, since you mentioned the Node warning) bump `oven-sh/setup-bun@v2` step usage is fine — only `actions/checkout@v4` itself emits the Node 20 warning, and there is no `@v5` yet, so leave it. The warning is harmless and doesn't fail the build.

## Result

CI's Lint step passes, the build goes green, and the Node 20 message remains as a harmless warning until GitHub ships `actions/checkout@v5`.
