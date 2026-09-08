# Gateway

Blob calls an undocumented internal HTTP API. The surface can change without notice. This page describes what Blob v1 actually sends, not a public contract.

## Where it lives

Default base URL: `http://127.0.0.1:1340`

Reach it on localhost, over an SSH tunnel, or over a private mesh (see [connecting.md](connecting.md)). Do not put the gateway on the public internet.

The token is a password. Type it in the settings field (password input). Do not put it in the URL, in git, or in logs.

## Auth

`Authorization: Bearer <token>` on every request except `GET /health`.

Blob also sends:

- `Content-Type: application/json`
- `x-sand-request-id`: a UUID per request

## Routes Blob uses

| Method | Path | Body | Notes |
|--------|------|------|--------|
| `GET` | `/health` | none | No bearer token. Treat `{ ok: true }` as healthy. |
| `POST` | `/api/listAgents` | `{}` | Roster. Blob reads `id`, `name`, `isGroup`, `isRunning`, `isComposingMessage`, `awaitingUserResponse`. |
| `POST` | `/api/sendPrompt` | `{ "agentId": "<uuid>", "prompt": "<text>", "replyToId"?: "<entry id>", "attachmentPaths"?: string[], "attachmentNames"?: string[] }` | Must return `{ "accepted": true }`. `replyToId` threads a reply to a transcript entry. `attachmentPaths` are **host-local** filesystem paths (not image bytes). Blob uses them for screenshots when the gateway can read this Mac; a remote/tunneled host will not see the pixels. Host `uploadAttachment` is not called — no documented body in the SDK. |
| `POST` | `/api/getAgentTranscriptTail` | `{ "id": "<uuid>", "limit": 80 }` | The id field is `id`, **not** `agentId`. |
| `POST` | `/api/reactToMessage` | `{ "entryId": "<id>", "emoji": "<face>", "agentId"?: "<uuid>" }` | Toggle a reaction on a transcript entry. |
| `POST` | `/api/respondToWidget` | `{ "entryId": "<id>", "value": "<text>", "agentId"?: "<uuid>" }` | Answer a `send-message` choice widget. |
| `POST` | `/api/dismissWidget` | `{ "entryId": "<id>", "agentId"?: "<uuid>" }` | Dismiss a pending choice widget. |
| `POST` | `/api/resolveAutoReviewApproval` | `{ agentId, entryId, requestId, resolution: "approved" or "denied" }` | Human gate on an auto-review card. |
| `POST` | `/api/resolveLocalToolPermission` | `{ agentId, entryId, requestId, resolution: "allow-once" or "deny" }` | Human gate on a local-tool card. |

Blob does not call destructive commands (no delete, kill, wipe, or similar). It also does not call `submitSecret` — secret-request cards tell the user to open Grok Bot.

## Client

Optional community package: [`@adam91holt/grokbot-sdk`](https://github.com/adam91holt/grokbot-sdk) (`GrokBot({ gatewayUrl, token })`). If that module is not installed, Blob falls back to `fetch` against the same routes.

## What not to ship

A published tree ships placeholders, not a real `gateway.json` and not a real token. `gateway.json` is gitignored on purpose.
