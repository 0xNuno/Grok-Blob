# Releasing Blob

Mac-first packaging plus GitHub Releases for an OSS showcase.

This repository is the clean public showcase tree. Private lab history (mesh IPs, personal paths) stays in a separate private remote and is not flipped public. Day-of list: [launch-checklist.md](launch-checklist.md).

## Releases on this repo

Tag and attach binaries via GitHub Releases on this repo. Before any publish, search the tree for lab IPs, `/Users/`, tokens, and setup keys.

## Build the prod app

Need Node 22+. Prefer a working copy outside iCloud Documents. After packaging, copy the app bundle to `~/Applications` or `/Applications`.

Exact commands: `package.json` scripts (`icons`, then `pack` / `dist` via `scripts/zipapp.mjs`) and [build-commands.md](build-commands.md).

Product name: Blob. App id: `com.0xnuno.grokblob`.

Output folder: `dist-out/` (or `BLOB_OUT` / default cache path on macOS via `zipapp.mjs`; gitignored). Typical artifacts:

- `dist-out/mac-arm64/Blob.app`
- `dist-out/Blob-1.0.0-arm64.dmg`
- `dist-out/Blob-1.0.0-arm64.zip`

Copy for daily use:

    cp -R dist-out/mac-arm64/Blob.app ~/Applications/

First open on macOS may show an unidentified-developer warning (unsigned OK for early drops). Use Right-click then Open, or allow under System Settings > Privacy & Security. Optionally: `xattr -dr com.apple.quarantine /path/to/Blob.app`.

## First-run after install

1. Launch Blob.
2. Enter gateway URL (default `http://127.0.0.1:1340`) and token. Prefer localhost or a private mesh URL - see [connecting.md](connecting.md). Do not bake VPN into the installer.
3. Grant Screen Recording if you use capture. Add Blob (or Electron while developing).
4. Summon with Command+Shift+Space. Tray icon toggles the sheet.

## GitHub Releases

Prefer Releases on this repo.

Tag and attach dist-out dmg/zip using the release-notes template. No tokens or lab IPs in artifacts.

## Apple notarization later

Needs Developer ID and notary access. Until then unsigned with Right-click Open is fine. See launch-checklist.md.

## After you flip the repo public

Enable GitHub **Secret scanning** and **Push protection** (Settings → Code security). On a free private repo those are unavailable; they unlock once the repo is public. You can ask your Grok Bot to turn them on with `gh` after the flip.

