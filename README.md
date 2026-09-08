# Blob

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What

Blob is a Mac overlay for Grok Bot agents: summon it with a hotkey, talk to your agents, and follow shared activity without living in the official tab. The same architecture is a baseline for building custom dashboards and workflows on Grok Bot infrastructure.

It is a thin local client over the host private HTTP gateway (localhost or a private mesh). Not a host, not SaaS. Until there is a public API, that gateway is the headless path: same agents, your own interfaces on top.

Mac-first (Linux for smoke). MIT, copyright 2026 Nuno Cortesao. The published tree ships placeholders only, never a real `gateway.json`.

## What's in

- **Summon:** `⌘⇧Space` or `⌘⇧B`, with a menu-bar tray toggle.
- **Multi-display:** `⌘⇧M` moves the sheet to the next display, laptop-first.
- **Agent switch:** agent chip, `⌘K`, `⌘⇧]` / `⌘⇧[`, `⌘1-9`, or a two-finger horizontal swipe across the header.
- **Chat:** user and assistant bubbles, reply-to, reactions, widgets, `⌘F` find, and typing while an agent is busy.
- **Screenshots:** `⌘⇧2` captures a region; option-click the composer capture button for the full screen.
- **Activity pipeline:** tasks and live roster, drag reorder, Details and Clear, plus a chron line and Sync.
- **Bots | Mine:** separate activity and personal task tabs.
- **Resize:** drag the seam between chat and pipeline; the panel width persists.
- **Sync:** `⌘⇧R` refreshes agents, transcript, and activity.
- **Connect:** gateway URL plus token in Keychain, with optional `.env` support.

Blob is not always-on-top and does not hide on blur.

## Docs

- [Architecture](docs/architecture.md) - process split, v1 send path, and non-goals
- [Gateway](docs/gateway.md) - private HTTP API Blob calls
- [Connecting](docs/connecting.md) - SSH, mesh, and what not to expose
- [Security](docs/security.md) - token storage, pre-release checklist, and what not to ship
- [Launch checklist](docs/launch-checklist.md) - day-of Launch to Prod: security, package, and smoke
- [Releasing](docs/releasing.md) - packaging and GitHub Releases for this public tree
- [Pipeline](docs/pipeline.md) - living roadmap for chat, agent switching, and capture
- [Upgrading / What’s next](docs/upgrading.md) - queued fixes and features after launch
- [Activity schema](docs/activity-schema.md) - portable `activity.json` tasks any host bot can write

## Run on a Mac

Node 22+ is required.
```sh
npm install
npm run dev
```
Scripts: dev runs the app, build writes dist, typecheck runs tsc --noEmit, icons generates app and tray icons, and pack / dist build an unsigned Mac app into ~/Library/Caches/GrokBlob/out.

## Production build

Package a real app outside the esbuild dist/ tree into ~/Library/Caches/GrokBlob/out, then copy Blob.app to ~/Applications or /Applications. Do not daily-drive from iCloud Documents.

- productName: Blob
- appId: com.0xnuno.grokblob
- VPN or mesh software is not included in the installer.
- Build commands, first-open macOS notes, and GitHub Releases: [docs/releasing.md](docs/releasing.md)
- Pre-ship checklist and security notes: [docs/security.md](docs/security.md)

## First run

1. Enter the gateway URL. The default is http://127.0.0.1:1340; use localhost first, or an SSH forward or private mesh for a remote gateway. See [docs/connecting.md](docs/connecting.md).
2. Enter the token. It is stored in Keychain through Electron safeStorage when available, never logged, committed, or placed in a query string.
3. Optionally provide GROKBOT_GATEWAY_URL and SAND_GATEWAY_TOKEN in a local .env file.
4. For capture, grant Screen Recording access to Blob (packaged) or Electron (development) under System Settings > Privacy & Security > Screen & System Audio Recording. Your agent can open that pane and walk you through it; you still have to click Allow.
5. Summon Blob with the summon shortcut, fallback, or tray icon.

The v1 send path is POST /api/sendPrompt, poll POST /api/listAgents until the agent is no longer running or composing, then call POST /api/getAgentTranscriptTail and show the latest assistant text. See [docs/architecture.md](docs/architecture.md).

## Shortcuts

| Action | Chord |
| --- | --- |
| Summon or hide | ⌘⇧Space |
| Summon fallback | ⌘⇧B |
| Move to next display | ⌘⇧M |
| Find in transcript | ⌘F |
| Open agent picker | ⌘K |
| Next / previous agent | ⌘⇧] / [ |
| Jump to agent | ⌘1-9 |
| Capture region | ⌘⇧2 |
| Sync | ⌘⇧R |
| Close the current overlay or hide | Esc |

Summon uses ⌘⇧Space, with ⌘⇧B as fallback. Move display is ⌘⇧M, find is ⌘F, picker is ⌘K, cycle is ⌘⇧] / [, capture is ⌘⇧2, and Sync is ⌘⇧R.
The tray icon toggles the sheet. A two-finger header swipe cycles agents. Drag task rows to reorder the pipeline, and drag the chat-pipeline seam to resize it; the width persists. If registration fails, Blob reports hotkey already taken.

## Security (short)

Use localhost, an SSH tunnel, or a private mesh such as WireGuard, Headscale, Netbird, or ZeroTier (Tailscale is optional). Do not expose the gateway, use ngrok, or use raw public TCP. Keep the token out of URLs and use the bearer token on every endpoint except GET /health. Private lab history stays elsewhere; this tree is the clean public source. See [docs/security.md](docs/security.md), [docs/connecting.md](docs/connecting.md), and [docs/releasing.md](docs/releasing.md).

## Dev notes

Linux dev mode opens a normal frameless window, which is enough to smoke-test settings, chat, and the pipeline. Mac is the primary target.
