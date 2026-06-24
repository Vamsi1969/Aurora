## Problem

CI's "Lint, typecheck & build" job exits 1 because `bun run lint` fails. The Node 20 deprecation line is just a runner warning, not the error. Three real issues:

1. **Prettier formatting violations** across several files added in recent work (mostly `src/routes/lovable/email/queue/process.ts`, plus chat/persona/voice files).
2. **`@typescript-eslint/no-explicit-any`** — `SupabaseClient<any, any>` used twice in `src/routes/lovable/email/queue/process.ts` (lines 39 and 91).
3. **`@typescript-eslint/no-unused-expressions`** — `src/lib/use-voice-input.ts` line 90 has an expression-only statement.

## Fix

- Run `bunx prettier --write` on the failing files to resolve all `prettier/prettier` errors in one pass.
- In `src/routes/lovable/email/queue/process.ts`, replace `SupabaseClient<any, any>` with the typed `SupabaseClient<Database>` (importing `Database` from `@/integrations/supabase/types`), matching the rest of the codebase.
- In `src/lib/use-voice-input.ts` line 90, turn the bare expression into a real statement (e.g. `void expr;` or assign/call it properly — exact shape decided when reading the line).
- Leave the existing `react-refresh/only-export-components` warnings alone — they're warnings, not errors, and don't fail CI.

The Node 20 deprecation notice about `actions/checkout@v4` is informational only (GitHub forces it onto Node 24 automatically); no workflow change is required to fix the failing job. I'll leave `.github/workflows/ci.yml` untouched.

## Verification

After the fixes, run locally:
- `bun run lint` → 0 errors
- `bunx tsc --noEmit` → clean
- `bun run build` → succeeds
