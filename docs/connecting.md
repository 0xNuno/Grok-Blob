# Connecting to the gateway

Blob on a Mac talks to a Grok Bot host's private HTTP gateway (usually `:1340`). The token is a password. Never expose `1340` on the public internet.

The URL Blob stores should stay **localhost** or a **private mesh IP**. Do not point it at a public hostname.

Set `GROKBOT_GATEWAY_URL` and `SAND_GATEWAY_TOKEN` in a local `.env` (gitignored), or type them in the first-run sheet. See [gateway.md](gateway.md) and [security.md](security.md).

## Goal

Mac Blob → host-private gateway. Same machine or a trusted LAN is fine if `1340` stays on loopback or a private address. Remote is fine only through a tunnel or a mesh. The gateway is not a public API.

Default is localhost (`http://127.0.0.1:1340`). Blob does not bundle a mesh.

SSH needs a host that **accepts** SSH. Some Grok Bot computers don't (no sshd, or no login). Then a mesh is the path, not a public TCP hole. The Mac already has the SSH **client**; you do not brew one.

Self-hosted mesh (Headscale / WireGuard / Netbird) is power-user, not a brew-default and not part of Blob's installer. ZeroTier / Tailscale remain optional one-liners if you already use them.

## Options (free / OSS first)

### 1. SSH local forward (preferred when SSH exists)

On the Mac (the SSH client is already there):

    ssh -L 1340:127.0.0.1:1340 user@host

Keep that session open. Blob uses `http://127.0.0.1:1340`. The token still goes as a Bearer header; it is not in the URL.

`user@host` is whatever already works for that machine. The forward is what keeps `1340` off the public internet. Skip this option if the host does not accept SSH.

### 2. WireGuard / Headscale / Netbird (self-hosted mesh)

Run a WireGuard network, or a self-hosted control plane such as [Headscale](https://headscale.net/) or [Netbird](https://netbird.io/). Give the Mac and the Grok Bot host addresses on that mesh.

Power-user. Not a brew-default; Blob does not install this for you.

Blob URL: `http://<host-mesh-ip>:1340` (or the mesh DNS name if you have one). Still private. Do not port-forward `1340` to the public internet "just in case".

### 3. ZeroTier (free personal)

[ZeroTier](https://www.zerotier.com/) personal networks are free. Join Mac and host to the same network. Blob URL is the ZeroTier IP (or name) on port `1340`.

Same rule: mesh-only, not a public listener.

### 4. Tailscale (optional)

[Tailscale](https://tailscale.com/) personal is free; paid tiers exist. Useful if you already live there. **Not required for OSS users.** SSH forward or a self-hosted mesh is enough.

If you use it, Blob URL is `http://<tailscale-ip-or-magicdns>:1340`. MagicDNS is still a private name; do not confuse it with a public website. Use your own mesh IP or MagicDNS name — never commit a real one into docs or examples.

### 4b. Netbird Cloud (optional)

[Netbird](https://netbird.io/) also offers a hosted control plane as an alternative to self-hosted Netbird / Headscale. Join Mac and host to the same Netbird network, then point Blob at `http://<netbird-ip-or-dns>:1340`. Same rules: private mesh only, token as Bearer, do not expose `:1340`.

Mac (Homebrew) sketch:

    brew install netbirdio/tap/netbird
    sudo netbird service install
    sudo netbird service start
    netbird up

GUI: `brew install --cask netbirdio/tap/netbird-ui`

Headless host join uses a setup key from the Netbird dashboard (`netbird up --setup-key <key> --no-browser`). Prefer a short hostname you choose; do not publish lab hostnames or mesh IPs in docs.

### 5. Cloudflare Tunnel + Access — only with care

A tunnel can put an origin behind Cloudflare, and Access can require login. That is still a **public** hostname in front of a **private** gateway. Easy to misconfigure into "anyone with the URL".

Use this only if you already run Access correctly (SSO / allowlist, no anonymous), and you accept that Blob will call that hostname. Prefer SSH or a mesh. Do not treat a tunnel as a substitute for keeping `1340` off the internet.

### 6. Rejected

Do **not**:

- Put `1340` on a raw public TCP port (home router port-forward, cloud security-group `0.0.0.0/0`, "just for a minute").
- Use ngrok (or similar) to give the gateway a public URL.

A public TCP path plus a bearer token is still a public control plane for the host.

## `.env`

On the Mac, a local `.env` next to the app (gitignored) can set:

    GROKBOT_GATEWAY_URL=http://127.0.0.1:1340
    SAND_GATEWAY_TOKEN=...

For SSH local forward, leave the URL on loopback. For a mesh, use the host's mesh IP, still `http://`, still port `1340` unless you changed the bind.

Never commit `.env`. Never put the token on a query string.
