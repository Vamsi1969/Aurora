Add a Settings (gear) icon button to the chat header so the Settings dialog (Custom instructions + GitHub panel) opens with one click, without needing the sidebar.

## What changes

- In `src/components/chat/ChatShell.tsx`, add a `Settings` icon `Button` to the top header bar of the chat view (right side, next to existing header controls).
- Clicking it calls `setSettingsOpen(true)` — reusing the existing `SettingsDialog` and `settingsOpen` state already in the file.
- Style: `variant="ghost"` `size="icon"` with the lucide `Settings` icon (already imported), `aria-label="Settings"`, and a tooltip/title attribute.
- Visible on both desktop and mobile so users on small viewports don't need to open the sidebar drawer.
- The existing "Custom instructions" entry in the sidebar stays as-is.

## Out of scope

- No changes to the dialog contents, GitHub panel, or routing.
- No rename of the sidebar entry.
