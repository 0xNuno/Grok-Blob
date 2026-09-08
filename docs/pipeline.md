# Feature pipeline

Living list for Nuno and Blob Builder. Not a schedule, not a backlog tool. When you sit down, pick from the top of a stage; move items when the product changes.

v1 is a quiet overlay: agent `<select>`, poll-then-tail transcript, prompt box. This page is what is still worth doing. Nuno's asks are marked **ask** so they stay first-class even if they sit in different stages.

Sizes are T-shirt (S / M / L), not dates.

## Now

### ~~Richer chat — match Grok Bot, not a stripped overlay~~ **ask** — M **done**

Shipped: the overlay reads as live chat without streaming.

- Emoji reactions on hover (`👍 👎 ❤️ 😂 🎉 👀`). Writes go through host `POST /api/reactToMessage` `{ entryId, emoji, agentId }`. Host `reactions` on the tail win; if the host does not echo them, Blob keeps an in-memory overlay for the session (not disk).
- Reply-to: each bubble has reply; the composer quotes the parent; send includes host `replyToId`. Bubbles render `replyToId` / `reply_to` / `replyTo` as a quote when the parent is in the loaded tail.
- Right-click a bubble for a compact menu (reply, the same six reactions, copy message text). Hover pills and the reply button stay. Esc / click-outside / scroll dismisses; the native browser menu is suppressed on messages.
- Widgets/status: `send-message` payloads of type `widget`, `auto-review-approval`, `local-tool-permission`, `secret-request`, and `cursor-agent` paint as cards (buttons + status), never as JSON dumps. Choice → `respondToWidget` / `dismissWidget`. Approvals → `resolveAutoReviewApproval` / `resolveLocalToolPermission`. Secret cards stay host-only (no `submitSecret`). After a widget/gate action Blob still poll-then-tails; no event bus.

Previously shipped in this item: distinct user/assistant bubbles; Blob-face working animation while `busy`.

### ~~Chat typography~~ — S **done**

Shipped: system sans (`-apple-system` / SF Pro / `system-ui`) for the sheet and message body instead of Palatino; 16px / 1.5; slightly brighter `--ink` / `--mute`. Brown palette kept. Type pass only.

### ~~Save & Connect confirmation~~ — S **done**

Shipped: after Save & Connect the setup sheet shows success or failure in place (banner + inline status). Failure keeps setup with the error (gateway down, bad token, fetch failed). Success flashes "connected" then enters chat.

### ~~Token replace UX~~ — S **done**

Shipped: when `tokenSet`, setup shows `token saved · ••••••••` (fixed mask, never the raw token). Type-to-replace stays; the field is no longer a blank password that looks unset.

### ~~Activity panel (agents + in-flight work)~~ — M **ask** **done** (v1)

Shipped: header toggle opens a side panel (window grows ~252px so chat is not covered). The view is a **mix**: pipeline **tasks** (who is on what) plus a compact live **agent roster**.

- Tasks from the published portable schema ([activity-schema.md](activity-schema.md), `blob.activity/v1`). Any Grok Bot host bot can write `<cwd>/activity.json`. Also reads `.blob-activity.json` and Electron `userData/activity.json`. Baseline is the schema; extra fields are ignored.
- Each task row shows status and an **agent chip** (`agentId` / `agentName`). Chip busy/composing/awaiting-you/idle is live from `listAgents` (poll 2.5s while open). Click a chip or roster row to select that agent.
- Not executor hooks. Demo tasks are seeded in userData if no file exists. Main IPC: `getActivity` / `setActivityTasks`.
- Chron: while the panel is open (and every ~15s while closed) Blob re-reads `activity.json`, diffs by task id in memory, and shows last-checked + `2 updated · 1 new` / `no change`. Panel Sync (and header Sync / `⌘⇧R`) force a re-read immediately with a brief `syncing…` on the chron line, and refresh the agent roster. Status changes flash. `running`/`queued`/`waiting` older than ~2h get a `stale` label. Demo seed alone older than a few hours shows `demo seed — waiting for host activity.json`. Demo rows are dropped when a host file has real tasks.
- Statuses include `waiting` (decision) and `next` (planned). Unknown statuses are a muted label.
- Right-click a row for Details (`note` / `description` popover) and Clear. `done` rows also have a checkmark to clear. Dismiss is local (`userData/dismissed-activity.json`); host `activity.json` is not rewritten. A later newer `updatedAt` with an in-flight status brings the row back.
- Task rows keep **array order** as priority (top = highest). Grab handle drag-and-drop (and right-click Move up / Move down) rewrite `userData/activity.json` via `setActivityTasks`, stamp optional `priority` to the index, and flash `reordered` on the chron line. No LLM call.

- Done: the chat-to-pipeline divider is draggable, and the chosen pipeline width persists.
- Done: the pipeline can expand wide enough for richer task Details, including the task note or description.

### ~~Pipeline task reorder~~ **ask** — S **done**

Shipped: each non-dismissed activity-panel task row has a six-dot grab handle for drag-and-drop reordering (drop between rows; brown grab cursor / ghost / placeholder) plus Move up / Move down in the right-click menu next to Details / Clear as an accessibility fallback. Reorder writes Electron `userData/activity.json` through existing `setActivityTasks`; array order is Blob Builder priority (top = highest). Optional schema field `priority` (number, `0` = highest) is kept in sync with index — readers that ignore it still work. Chron briefly says `reordered`. Does not call the LLM and does not rewrite a host `activity.json`.


### Personal Mine tab on the activity board — S **ask** **done**

Shipped: pipeline section head has a segmented **Bots | Mine** toggle (last tab persisted in `localStorage`). **Bots** keeps the existing `activity.json` chron / demo seed / Sync. **Mine** is a separate local board (`userData/mine-tasks.json`, schema `blob.mine/v1`, dismiss via `dismissed-mine.json`) with an Add row, grab reorder via `setMineTasks`, Clear / Details / Cycle status. Agent writers cannot overwrite it. Agents roster stays visible under both tabs.

### ~~Move blob to another display~~ **ask** — S **done**

Shipped: `Command+Shift+M` cycles the overlay onto the next display (same relative work-area position, clamped). One screen: no-op. Display ids are unstable, so placement persists a geometry signature (`window-state.json`) and reclamps on display-removed / metrics-changed. Tray and Window menu can move it too. Mechanisms from ProLocalAgent, not a UX clone.

### ~~Search in conversation~~ **ask** — S **done**

Shipped: overlay-native quick find on the loaded transcript / current agent chat. `Command+F` (sheet focused) opens a compact find bar; case-insensitive match; highlights + Enter / prev-next to walk hits. Esc closes find first, then reply-quote, then hides the sheet — it does not fight reply-quote Esc. Not a mini IDE search panel. Brown palette + system sans.

### ~~Agent switching UX + keyboard shortcuts~~ **ask** — M **done**

Shipped: drive the roster from the keyboard while the sheet is focused. Header is a compact agent button (replaces the native `<select>`). `Command+K` opens a searchable picker overlay; type to filter, arrows + Enter to choose. `Command+Shift+]` / `Command+Shift+[` cycle next / previous. `Command+1`…`9` jump to the nth agent. Two-finger horizontal trackpad swipe anywhere on the header bar (wheel `deltaX` on the full chrome — padding, face, name, sync/activity/gear — not just the agent name) also cycles — fingers right → next, left → previous — with a short header/chip motion tinted toward the incoming agent (transcript stays still); ignored while find, agent picker, or the message context menu is open. Selecting still loads that agent's transcript. Esc closes the picker first, then find, then reply-quote, then hides. Does not fight summon `Command+Shift+Space`, find `Command+F`, or display `Command+Shift+M`.

### ~~Agent switcher header polish~~ **ask** — S **done**

Shipped: drop the "blob" wordmark so the agent name is the hero. Stable per-agent accent (Blob Builder brown, TheFirst blue, Growth silver, others a hashed pastel from id) on the face/dot, switcher chip, and a light header wash. Busy pulses the face without shoving the name. Swipe flash tints toward the incoming agent. Brown sheet chrome kept. Sync and activity controls stay in the header.

### ~~Screenshots / image attach~~ **ask** — L **done** (capture) / **partial** (host images)

Shipped: hide the overlay, wait for the `hide` event (250 ms cap), then macOS `screencapture`. Restore the sheet in `finally` so cancel / TCC failure cannot leave it stuck hidden. Region is the default (`-i`); full screen is option-click on the composer button or Edit › Capture Screen. Composer shows a thumbnail chip (bytes stay in main). `Command+Shift+2` while the sheet is focused (does not fight summon `⌘⇧Space`, display `⌘⇧M`, find `⌘F`, picker `⌘K`, cycle `⌘⇧] / [`). Paste image from clipboard onto the same chip list.

Host gap: `POST /api/sendPrompt` accepts `attachmentPaths` / `attachmentNames` — host-local filesystem paths, not image bytes. Blob writes the PNG to a temp file and sends those paths, then retries text-only if the host rejects them. That works when Blob and the gateway share a disk. A tunneled or remote gateway cannot read this Mac's temp path; the prompt still sends, the thumbnail stays in the composer until send, and the pixels are not uploaded. Host `uploadAttachment` exists in the command list but has no documented body in the SDK, so Blob does not invent one. Accessibility (AX) is not part of this item.

### ~~Sync with host~~ **ask** — S **done**

Shipped: header Sync (circular arrows, brown palette) pulls `listAgents` + the current transcript tail, then refreshes the activity pipeline (`activity.json` + roster chron). If the session is missing but settings still have creds, Blob recreates it then refreshes. Banner shows `syncing…` then clears, or the error banner on failure. `Command+Shift+R` while the sheet is focused (safer than `⌘R` reload). Activity panel has its own Sync for a force re-read without waiting for the chron poll. `asAgentRows` accepts `title` when `name` is missing.

### Hygiene: never commit `.env` / gateway token — S

Keep `.env`, `gateway.json`, and the token out of git. The published tree ships placeholders.

Standing rule, not a feature. One leak and the overlay is a credential dump.

### Hygiene: private path to the gateway — S

Keep `1340` off the public internet. Blob's URL is localhost or a private mesh IP. Free/OSS modes (SSH local forward first, then WireGuard / Headscale / Netbird, ZeroTier; Tailscale optional) are in [connecting.md](connecting.md). ngrok and raw public TCP are rejected.

Standing. Documenting the modes is done. Modest helpers only (see installer philosophy); do not ship a mesh.

### Installer: localhost-first, no bundled mesh — S

Default install talks to localhost. Optional later: a settings helper to open an SSH local forward, or a field to paste a private mesh URL. Do **not** bundle Headscale, WireGuard, or a mesh control plane into the default install — too hard and too privileged for non-devs. ZeroTier / Tailscale remain optional one-liner meshes if the user already lives there.

Standing. Clarify in [connecting.md](connecting.md). Do not grow a mesh installer.

### Packaging Mac app outside iCloud Documents — L **in progress** (ship 2026-09-04)

Prod path for tomorrow: packaging via `scripts/zipapp.mjs`, productName Blob, appId `com.0xnuno.grokblob`, icons from `scripts/make-icon.mjs`, output `~/Library/Caches/GrokBlob/out` then copy to `~/Applications` or `/Applications`.

When Apple certs are missing, ship an unsigned/ad-hoc `.app` with first-open docs. Localhost-first onboarding; no VPN in the installer. Pre-release checklist: [security.md](security.md). Day-of Launch to Prod: [launch-checklist.md](launch-checklist.md). Release + GitHub Releases: [releasing.md](releasing.md).

## Next

### Streaming / live updates — M

If the host events bus is actually useful, push transcript and status instead of poll-only (`listAgents` every 800 ms until idle, then one tail fetch).

Polling works and is honest. Live updates would make send/receive feel real, which richer chat also needs. Drop this if the bus is flaky.

## Later

### Hotkey rebind UI with press-test — M

Let the user pick a summon chord, then press it to prove it fires. Do not trust `globalShortcut.register() === true`.

v1 hardcodes `Command+Shift+Space`. A true `register()` is not the same as the chord working, and the sheet only shows `hotkey already taken`.

## Maybe

Clearly optional. Do not start these unless Now / Next is boring.

### Always-on-top pin — S

Opt-in pin, off by default. v1 is explicitly not always-on-top and does not hide on blur.

Useful for a long agent run. Wrong as a default — it covers the work.

### Accessibility / selected-text from other apps — L

Spike only. Read selected text (or similar) from the frontmost app. AX on macOS is uneven; do not promise it, and do not treat a spike as shipped.

Same caution as screenshots: AX is not in v1 and should not sneak in as a "small add".

### Swift rewrite — L

If Blob becomes a daily driver and Electron weight or panel quirks get in the way, consider a native Swift overlay talking to the same gateway.

Only if Electron is the problem. Do not rewrite for sport.

### Open-source polish — S

`CONTRIBUTING`, screenshots in the README, maybe a short "how to run against a fake gateway". The tree is already MIT and meant to be public — via a **new** scrubbed showcase repo ([releasing.md](releasing.md)), not by flipping the private remote. Day-of list: [launch-checklist.md](launch-checklist.md).

Nice for strangers. Not needed for Nuno to use it.

### Modest connect helpers (SSH tunnel / paste mesh URL) — S

Settings is a URL + token. A later sheet may offer an SSH local-forward helper and a place to paste a private mesh URL. Not a mesh installer. Docs-only today ([connecting.md](connecting.md)). Do not start this unless people actually fail to connect.

### Advanced remote / mobile / away-from-desk — L

Use Blob from a phone or while away from the desk. Official Grok Bot may cover phone; a Blob remote mode can wait.

Do not build now. Parked until the official client's story is clear and Now / Next is boring.

## Ideas backlog

Parking lot. Promote if it keeps coming up.

- Markdown (and code) in the transcript — assistant replies are escaped plain text today.
- Copy last reply as a shortcut — copy this message is on the bubble context menu.
- Remember sheet size and position per display — placement is currently whatever Electron does.
- Connection / agent-busy indicator in chrome — roster already has `isRunning` / `isComposingMessage`; the header barely uses them.
- Retry or cancel a stuck send — a 15 minute poll timeout is a long silent wait.
- Group-agent UX — groups are labeled in the dropdown and otherwise treated like people.
- Fake-gateway fixture for Linux smoke tests — renderer work should not need a live host.
