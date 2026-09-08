# Launch to Prod checklist

Day-of checklist for shipping Blob as a usable Mac overlay and a clean public showcase. Private lab history stays elsewhere; ship from this clean tree + GitHub Release — see [releasing.md](releasing.md).

## Security

- [ ] Token / `.env` / `gateway.json` / `*.token` are gitignored and **not** in the tree or the public export
- [ ] No real Tailscale / Netbird / LAN IPs, MagicDNS names, lab hostnames, or absolute personal paths in docs, README, scripts, or examples (placeholders only: `127.0.0.1`, `<host-mesh-ip>`)
- [ ] Gateway stays private: localhost, SSH local forward, or a private mesh — never raw public TCP, ngrok, or similar
- [ ] Token is Bearer only; URL reject for `token=` / `bearer` in query/fragment; public-tunnel hostnames blocked; soft warning for non-private hosts ([security.md](security.md))
- [ ] Logs / errors run through `redactSecret` before sheet or console
- [ ] Screen Recording: note in first-run or README that region/full capture needs macOS Screen Recording permission for Blob (System Settings → Privacy & Security). Capture hides the sheet first so Blob is not in the shot

## Clean public showcase

- [ ] Confirm this tree has no private IPs, tokens, `.env`, or local helper scripts with home paths
- [ ] Do **not** flip or force-push private lab remotes; keep lab history private
- [ ] Tag `v1.0.0` (or current) and attach artifacts via **GitHub Releases** ([releasing.md](releasing.md))

## Package `.app` / `.dmg`

- [ ] `npm run build` then `npm run dist` (electron-builder; icons from `npm run icons`)
- [ ] Unsigned build is OK for tomorrow: document Gatekeeper right-click → Open (or `xattr -dr com.apple.quarantine` on the `.app`)
- [ ] Notarize / Developer ID signing later when certs exist — park full notarization

## Smoke (Mac)

- [ ] Summon / hide: `Command+Shift+Space` (and tray)
- [ ] Send a prompt: composer unlocks after accept; sheet does **not** freeze while waiting for idle
- [ ] Header swipe: two-finger horizontal swipe works across the **full** header bar (not only the agent chip)
- [ ] Activity: Sync refreshes pipeline; drag grab handle (or Move up / Move down) reorders tasks
- [ ] Connect over Tailscale (or SSH forward) to the private `:1340` with a real token — confirm chat works

## README / onboarding

- [ ] README first-run: URL default `http://127.0.0.1:1340`, token as password, `.env` optional, link [connecting.md](connecting.md)
- [ ] Point strangers at this public showcase repo + Release assets, not any private clone path
- [ ] Short Security blurb + this checklist linked from README

## Parked (not blocking tomorrow)

- [ ] Netbird: prove peer join + Blob URL on a Netbird IPv4 (lab only; keep out of public docs)
- [ ] Remote screenshot upload: host-local `attachmentPaths` do not cross a tunnel; real remote pixels need a host upload path later
- [ ] Full notarization / signed Sparkle-style updates

## Done when

A teammate (or future you) can install from the public Release, pass Gatekeeper with the documented unsigned note, connect to a private gateway, summon, send, swipe, and sync activity — without ever seeing a lab IP or token in git.
