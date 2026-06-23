# ChatGPT-style AI Assistant

A multi-thread AI chat app powered by Lovable AI (Gemini 3 Flash), with user accounts and history saved to Lovable Cloud so conversations sync across devices.

## What gets built

**Auth**
- Email/password + Google sign-in
- Auth page at `/auth`; the app shell is protected

**Chat UI** (AI Elements + a custom brand layer)
- Left sidebar: New chat button, list of conversation threads, rename/delete, account menu
- Main pane: streaming messages, markdown rendering, code blocks with copy, "Thinking…" shimmer while loading
- Composer: auto-growing textarea, Enter to send / Shift+Enter newline, stop-generation button
- Each thread has its own URL (`/c/:threadId`), so reload restores that exact conversation
- Empty state with a few starter prompts

**Backend**
- Lovable Cloud tables: `threads` (id, user_id, title, timestamps) and `messages` (id, thread_id, role, parts JSON, created_at) with RLS scoping every read/write to the signed-in user
- Streaming chat server route calls Lovable AI Gateway with `google/gemini-3-flash-preview`, persists the user message + final assistant message
- Auto-generates a short thread title from the first user message

## Visual direction — "Distinctive custom brand"

Not another purple-on-white ChatGPT clone. Direction: **"Aurora Terminal"** — a calm, slightly futuristic editorial feel.

- **Palette (dark-first, light mode included)**
  - Background `#0B0F14` deep ink / light `#F7F6F2` warm paper
  - Surface `#121821` / `#FFFFFF`
  - Primary accent `#7CFFB2` aurora mint (used sparingly: send button, active thread, focus rings)
  - Secondary accent `#FF7A59` coral (user message bubble in light; subtle highlights in dark)
  - Muted text `#8A95A5`
- **Typography**
  - Headings/UI: **Instrument Serif** (italic for the wordmark) paired with **Geist Sans** for body
  - Code/inline mono: **Geist Mono**
- **Layout & feel**
  - Rounded 14px corners, hairline 1px borders, generous spacing
  - Assistant messages render as plain text on the surface (no bubble); user messages get a soft filled bubble using the coral/mint token pair with proper contrast
  - Subtle aurora gradient glow behind the empty-state logo only
  - Micro-animations: message fade+rise on append, shimmer on "Thinking…", sidebar slide on mobile
- **Identity**
  - Custom generated wordmark/logo (not the Sparkles icon) — small mark in sidebar, larger centered mark in empty state

## Technical notes

- Stack: TanStack Start + Lovable Cloud (Supabase) + AI SDK + AI Elements (`conversation`, `message`, `prompt-input`, `shimmer`)
- Model: `google/gemini-3-flash-preview` via Lovable AI Gateway (server-only `LOVABLE_API_KEY`)
- Routes: `/auth` (public), `/_authenticated/` layout, `/_authenticated/` index redirects to newest or new thread, `/_authenticated/c/$threadId` for each conversation; server route `src/routes/api/chat.ts` for streaming
- Tables created via migration with RLS policies + grants; threads cascade-delete their messages
- `useChat` keyed by `threadId`, messages loaded from DB on mount, assistant response persisted in `onFinish`

## Out of scope (can add later)
File/image uploads, web search tool, voice input, sharing conversations, custom system prompts.
