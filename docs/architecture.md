# Architecture

Blob is a thin Mac overlay. It is not a Grok Bot host. It does not run agents, and it is not a SaaS product. It talks to a private HTTP gateway that already exists on the machine that hosts Grok Bot.

## Process split

### Electron main

Owns everything that touches the OS or the gateway:

- `BrowserWindow` — Mac uses `type: "panel"`, frameless, `skipTaskbar`, dock hidden. Linux opens a normal frameless window so the sheet can be smoke-tested. `alwaysOnTop` is false. Hide does not destroy the window. Closing the sheet does not quit; the process lives in the tray.
- Global hotkeys via `globalShortcut`: `Command+Shift+Space` summons (fallback `Command+Shift+B` if Space is taken); `Command+Shift+M` moves the sheet to the next display (no-op with one screen). Placement persists a display geometry signature and reclamps if that display disappears. If summon `register()` returns false, the sheet shows `hotkey already taken`. Escape closes the agent picker first, then in-sheet find, then a reply quote, then hides. Capture (`Command+Shift+2`, sheet focused) is not global.
- Screenshots — hide the sheet, wait for the `hide` event, then `/usr/sbin/screencapture` (`-i -x` region, `-x` full screen). Summon is locked while capture is up so the overlay cannot photograph itself. Cancel and failure restore the sheet.
- Tray icon — click toggles the sheet. Context menu: Show, Move to next display, Quit Blob.
- Settings — gateway URL and token in Electron `userData` (`settings.json`, mode `0600`). Last selected agent id is remembered.
- Gateway client — see [gateway.md](gateway.md).
- Activity panel — optional side roster. Pipeline tasks come from a portable status file ([activity-schema.md](activity-schema.md)); live busy state comes from `listAgents`. IPC `getActivity` / `setActivityTasks` / `dismissActivityTask`. Array order is priority (top = highest); drag-reorder (or Move up / Move down) writes `userData/activity.json` and stamps optional `priority`. Renderer keeps an in-memory chron: re-read + diff by task id, last-checked line, stale running/queued, demo-seed note, brief `reordered`.
- Single-instance lock via `app.requestSingleInstanceLock()`. A second launch summons the existing sheet.

### Renderer

One sheet, no extra windows:

- Agent switcher — compact header control, `Command+K` searchable picker, `Command+Shift+]` / `[` to cycle, `Command+1`…`9` to jump, two-finger horizontal swipe anywhere on the header bar to cycle
- Transcript with overlay-native find (`Command+F`)
- Prompt box with a capture button and pending-image thumbnails
- Optional activity panel (pipeline tasks + agent chips + compact roster + last-checked chron with Sync). Toggle in the chrome; the window grows so chat is not covered. Header Sync also refreshes the activity feed.

Unconfigured, the same sheet is a settings form (gateway URL + token as a password field). The renderer talks to main only through the preload `window.blob` IPC bridge. It never holds the raw token after save; state only includes `tokenSet: boolean`.

## v1 send path

When the user submits a prompt:

1. `POST /api/sendPrompt` with `{ agentId, prompt }` and optional `replyToId`. When a screenshot is pending, Blob also sends `attachmentPaths` / `attachmentNames` (temp PNG on this Mac). If that is rejected, it retries prompt-only. The client requires `{ accepted: true }`.
2. Poll `POST /api/listAgents` with `{}` until the selected agent has `isRunning === false` and `isComposingMessage === false` (800 ms interval, 15 minute timeout).
3. `POST /api/getAgentTranscriptTail` with `{ id, limit }` — the id field is `id`, not `agentId`. Blob uses `limit: 80`.
4. Parse the tail into user/assistant messages and show them. The latest assistant text is what the sheet displays as the reply. The parser also lifts host `replyToId` / reactions and structured `send-message` widgets (choice, approval, secret, cursor-agent) so the sheet can quote, react, and render cards instead of dumping JSON.

Richer chat writes use the same poll-then-tail path: `reactToMessage` reloads the tail; widget and gate answers wait until idle then reload. Reactions the host does not echo are kept in memory for the session only.

Main prefers `@adam91holt/grokbot-sdk` if it can be required; otherwise it uses raw `fetch`.

Default agent: last used id, else a preferred named agent (TheFirst) if that id is on the roster, else the first non-group agent.

## Non-goals

Blob v1 does not:

- Drive other apps through Accessibility (AX)
- Stay always-on-top
- Hide on blur
- Split Chat vs Agent into separate lanes
- Host other people's bots
