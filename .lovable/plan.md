"Everything" is a lot — I'll build it in phases so each ships working. Phase 1 lands this turn; later phases on your go-ahead.

## Phase 1 (this turn) — core power-user features
1. **Model picker** in composer (Gemini 3 Flash, Gemini 2.5 Pro, GPT-5, GPT-5 Mini). Stored per-thread.
2. **Image upload (vision)** — paperclip → attach images, sent as multimodal `image_url` parts. Renders in user bubble.
3. **Image generation** — `/image <prompt>` slash command (and a toggle) streams from `openai/gpt-image-2` via a server route, renders inline.
4. **Web search** — toggle in composer; when on, switches to a Gemini model with built-in search grounding and shows source chips.
5. **Regenerate & edit** — hover actions: copy, regenerate (drops last assistant msg, re-streams), edit your prompt (truncates thread to that point and re-sends).
6. **Custom instructions** — Settings dialog, saved to `profiles.system_prompt`, prepended on every request.

## Phase 2 — collaboration & input
7. **Share link** — public read-only `/s/:shareId` route; "Share" button mints/revokes a token. RLS policy allows anon SELECT when `share_id is not null`.
8. **File/PDF upload** — attach PDFs sent as `file` parts to Gemini models.
9. **Voice input** — mic button uses browser `SpeechRecognition` (free, no backend).

## Phase 3 — artifacts
10. **Code canvas** — right-side panel that opens when the assistant emits a `<artifact>` block (code/markdown); editable, save back into the message. Heaviest piece, last.

## Technical notes
- **Schema additions**: `profiles(user_id, system_prompt)`; `threads.model`, `threads.share_id (unique, nullable)`; `messages.parts jsonb` (alongside existing `content` for back-compat) so we can store image URLs / generation results / tool calls.
- **Storage bucket** `chat-uploads` (private, RLS by `auth.uid()` prefix) for attached images/PDFs; signed URLs sent to the model.
- **Server routes**: existing `/api/chat` extended for multimodal + tool flags; new `/api/generate-image` (SSE streaming); new `/api/public/s/$shareId` for shared threads.
- **AI Elements**: install `tool`, `image`, `attachment`, `actions`, `suggestion` components and wire into existing `ChatWindow`.
- **Models**: web-search mode uses `google/gemini-2.5-flash` with `tools: [{ google_search: {} }]`; image gen uses `openai/gpt-image-2`.

Reply "go" to start Phase 1, or tell me which items to cut/reorder.