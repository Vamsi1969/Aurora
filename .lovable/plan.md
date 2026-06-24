## Problem

Image generation fails on every attempt. The `/image ...` command shows the optimistic "Generating image…" bubble, then disappears with a red toast.

## Root cause

The server route `src/routes/api/generate-image.ts` requires a `Bearer` token in the `Authorization` header and returns **401 Unauthorized** when one isn't supplied. The client helper `src/lib/stream-image.ts` posts to `/api/generate-image` with only `Content-Type` — no Authorization header — so the request is rejected before reaching the AI Gateway. `ChatWindow.doImageGeneration` catches the thrown error and removes the placeholder messages, which is exactly the behavior the user is seeing.

(Regular chat works because `/api/chat` is called through the AI SDK transport, which already injects the Supabase session token.)

## Fix

Update `src/lib/stream-image.ts` to fetch the current Supabase session and send `Authorization: Bearer <access_token>` along with the request. If there is no session, throw a clear "Please sign in again" error so the user gets actionable feedback instead of a silent 401.

### Technical detail

- Import `supabase` from `@/integrations/supabase/client`.
- Call `supabase.auth.getSession()` at the top of `streamImage`, read `data.session?.access_token`.
- Add `Authorization: \`Bearer ${token}\``to the existing`fetch` headers.
- Surface non-2xx responses with the upstream error text already in place (no other changes needed; the server route already proxies gateway errors back).

No other files change. No backend, schema, or secret changes needed — `LOVABLE_API_KEY` is already provisioned.

## Verification

1. Open a chat, run `/image a red panda eating bamboo`.
2. Expect the partial blurred preview to appear, then sharpen to the final image.
3. Reload, confirm the image persists in the thread (existing `saveImageGeneration` path).
