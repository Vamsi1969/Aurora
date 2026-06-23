Add a "Connect on GitHub" call-to-action to the disconnected state of the GitHub panel that explains the real flow (Lovable + menu → GitHub) so users don't expect an in-app push.

## Changes

- `src/components/chat/GithubPanel.tsx` — when no repo URL is saved, above the existing URL input add:
  - A short helper card explaining: "To create a repo and push this project's source, use Lovable's GitHub integration (Plus + menu → GitHub → Connect project)."
  - A primary **Connect on GitHub** button (Github icon) that opens `https://docs.lovable.dev/integrations/github` in a new tab as a guide.
  - Keep the existing "paste a public repo URL" input below, under a small "Already have a repo? Track it here" label, so the public-status feature still works.

## Out of scope

- No PAT flow, no GitHub OAuth, no secrets.
- No changes to the connected state, server function, or sync indicator.
