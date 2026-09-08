# Security

Blob is a local overlay that holds a gateway token. Treat that token like a password.

## Token storage

On first run the sheet asks for the gateway URL and token. Main writes them to Electron `userData`/`settings.json` with mode `0600`.

- If `safeStorage.isEncryptionAvailable()` (Keychain on Mac), the token is stored as `{ encoding: "safeStorage", payload: "<base64 of encrypted bytes>" }`.
- Otherwise main stores `{ encoding: "plain-local", payload: "<base64>" }` — still not git, still `0600`, still not returned to the renderer.

The renderer never sees the raw token after save. IPC snapshot state is `{ gatewayUrl, tokenSet: boolean }`. The settings form is `type="password"`. A typed token is sent once over `blob:saveSettings` and is not echoed back.

## Where the gateway may be

Localhost, SSH tunnel, or a private mesh (WireGuard / Headscale / Netbird / ZeroTier; Tailscale optional). Do not expose the gateway on the public internet. Do not put the token in the gateway URL (query string or hash).

Main rejects:

- URLs that contain `token=` or `bearer` in the query or fragment
- Known public tunnel hosts (ngrok, trycloudflare, localtunnel, serveo, loca.lt, and similar)

Save & Connect also soft-warns when the host is not clearly private (loopback, RFC1918, CGNAT 100.64/10, ULA, or known mesh DNS such as `.ts.net` / `.local`). Mesh MagicDNS and careful Cloudflare Access setups can still connect; prefer localhost-first ([connecting.md](connecting.md)).

## What must not leak

- Git: `.gitignore` includes `gateway.json`, `.env`, `.env.*`, `tokens`, `*.token`. The open-source tree ships placeholders, not a filled `gateway.json`.
- Logs: error strings run through `redactSecret` before they reach the sheet or console. Do not log the token in main or renderer.
- URLs: token is a Bearer header, never a query parameter.
- Chat / issues / release notes: never paste a live gateway token.
- `activity.json` notes: no secrets, tokens, or private URLs — notes can show in the activity panel.

## Screen capture temps

Captures land under the OS temp dir as `blob-<uuid>.png`. Bytes stay in main; the renderer only gets a chip + thumbnail. Temps are unlinked immediately on drop or clear. After a successful send, unlink is delayed about 60s so a local host can still read attachmentPaths. Do not copy capture paths into git or chat.

## Renderer isolation

`BrowserWindow` webPreferences:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`

Preload exposes a typed `window.blob` API via `contextBridge`. The page CSP is connect-src none so the renderer cannot fetch the gateway itself. Popups and navigations are denied.

`app.requestSingleInstanceLock()` keeps a second process from opening another sheet against the same settings file.

On Linux only, the main process may need Chromium no-sandbox to start. The BrowserWindow still sets sandbox and contextIsolation.

## Pre-release checklist

Run through this before tagging a showcase build:

1. **Git hygiene** — `git status` shows no `.env`, `gateway.json`, tokens, or packaged secrets. `.gitignore` covers `.env*`, `tokens`, `*.token`, `gateway.json`, `dist-out/`.
2. **Token handling** — Save & Connect stores via Keychain/`safeStorage` when available; snapshot only exposes `tokenSet`. Errors are redacted. No token in renderer logs.
3. **Gateway privacy** — Default URL is `http://127.0.0.1:1340`. Tunnel hosts are rejected. Docs say localhost / SSH / mesh only — no public port 1340.
4. **Installer philosophy** — Packaged app does **not** bundle a VPN/mesh. First-run is URL + token ([connecting.md](connecting.md)).
5. **Capture** — Screen Recording TCC note in README. Temp PNGs cleaned after send/drop.
6. **Activity** — No secrets in task `note` / `description` fields written by host bots.
7. **Dependencies** — After install, review known advisories for production deps. Fix criticals that touch the shipped app.
8. **Release path** — Follow [releasing.md](releasing.md) for build output and first-open warnings on macOS.

## Dependency review

Blob runtime surface is small (Electron + optional `@adam91holt/grokbot-sdk`). Treat advisory review as a step, not a merge gate for every transitive low.



## Checklist before you ship

- [ ] `.env` / tokens / `gateway.json` never committed (see `.gitignore`)
- [ ] Docs and examples use placeholders — no real mesh IPs, lab hostnames, or `/Users/...` paths
- [ ] Gateway URL is loopback, SSH-forwarded loopback, or a private mesh address
- [ ] `redactSecret` covers error paths that could echo the token
- [ ] Public showcase is a **new** clean repo + GitHub Release — not this private history ([releasing.md](releasing.md))
- [ ] Day-of pass: [launch-checklist.md](launch-checklist.md)

Screen Recording: macOS will prompt (or deny) for region/full capture. Document that Blob needs Screen Recording permission; the overlay hides before capture so it is not in the shot.
