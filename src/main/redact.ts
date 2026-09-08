export function redactSecret(text: string, secret: string | undefined): string {
  if (!secret || secret.length === 0) return text;
  return text.split(secret).join("[redacted]");
}

const BLOCKED_HOST_RE =
  /(^|\.)ngrok(-free)?\.(app|io|dev)$|(^|\.)loca\.lt$|(^|\.)localtunnel\.me$|(^|\.)serveo\.net$|(^|\.)trycloudflare\.com$|(^|\.)tunnelmole\.(com|net)$|(^|\.)pagekite\.me$/i;

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1";
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // CGNAT / Tailscale / many meshes: 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;
  // link-local
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(":")) return false;
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
}

function isKnownMeshHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.endsWith(".ts.net") ||
    h.endsWith(".tailscale.net") ||
    h.endsWith(".zerotier") ||
    h.endsWith(".nb.local") ||
    h.endsWith(".netbird.cloud") ||
    h.endsWith(".local")
  );
}

/** True when the host is loopback, RFC1918, CGNAT, ULA, or a known mesh DNS suffix. */
export function isPrivateGatewayHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return false;
  if (isLoopbackHost(h)) return true;
  if (isPrivateIpv4(h)) return true;
  if (isPrivateIpv6(h)) return true;
  if (isKnownMeshHost(h)) return true;
  return false;
}

export function assertNoQueryToken(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Gateway URL is not valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Gateway URL must be http or https.");
  }
  const haystack = `${parsed.search} ${parsed.hash}`.toLowerCase();
  if (haystack.includes("token=") || haystack.includes("bearer")) {
    throw new Error("Do not put the token in the gateway URL.");
  }
  const host = parsed.hostname;
  if (BLOCKED_HOST_RE.test(host)) {
    throw new Error(
      "Public tunnel hosts (ngrok, trycloudflare, localtunnel, …) are blocked. Use localhost, an SSH forward, or a private mesh.",
    );
  }
}

/**
 * Soft warning for Save & Connect when the URL is not clearly private.
 * Does not block mesh / Access edge cases — only nudges.
 */
export function publicGatewayWarning(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (isPrivateGatewayHost(parsed.hostname)) return null;
  return "URL looks public — prefer localhost, SSH forward, or a private mesh (see docs/connecting.md).";
}

export function normalizeGatewayUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  assertNoQueryToken(trimmed);
  return trimmed;
}
