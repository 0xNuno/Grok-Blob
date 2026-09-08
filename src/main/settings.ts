import { app, safeStorage } from "electron";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_GATEWAY_URL } from "../shared/types";
import { normalizeGatewayUrl } from "./redact";

type TokenRecord =
  | { encoding: "safeStorage"; payload: string }
  | { encoding: "plain-local"; payload: string };

type DiskSettings = {
  gatewayUrl: string;
  token: TokenRecord | null;
  lastAgentId: string | null;
};

export type LoadedSettings = {
  gatewayUrl: string;
  token: string;
  lastAgentId: string | null;
};

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function emptyDisk(): DiskSettings {
  return { gatewayUrl: DEFAULT_GATEWAY_URL, token: null, lastAgentId: null };
}

function encodeToken(token: string): TokenRecord {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encoding: "safeStorage",
      payload: safeStorage.encryptString(token).toString("base64"),
    };
  }
  return { encoding: "plain-local", payload: Buffer.from(token, "utf8").toString("base64") };
}

function decodeToken(record: TokenRecord): string {
  if (record.encoding === "safeStorage") {
    return safeStorage.decryptString(Buffer.from(record.payload, "base64"));
  }
  return Buffer.from(record.payload, "base64").toString("utf8");
}

function readDisk(): DiskSettings {
  const path = settingsPath();
  if (!existsSync(path)) return emptyDisk();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DiskSettings>;
    return {
      gatewayUrl:
        typeof raw.gatewayUrl === "string" && raw.gatewayUrl.length > 0
          ? raw.gatewayUrl
          : DEFAULT_GATEWAY_URL,
      token: raw.token && typeof raw.token === "object" ? (raw.token as TokenRecord) : null,
      lastAgentId: typeof raw.lastAgentId === "string" ? raw.lastAgentId : null,
    };
  } catch {
    return emptyDisk();
  }
}

function writeDisk(disk: DiskSettings): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  const path = settingsPath();
  writeFileSync(path, JSON.stringify(disk, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that ignore chmod
  }
}

export function loadSettings(): LoadedSettings {
  const disk = readDisk();
  let token = "";
  if (disk.token) {
    try {
      token = decodeToken(disk.token);
    } catch {
      token = "";
    }
  }
  return {
    gatewayUrl: disk.gatewayUrl,
    token,
    lastAgentId: disk.lastAgentId,
  };
}

export function saveSettings(input: {
  gatewayUrl: string;
  token?: string;
  lastAgentId?: string | null;
}): LoadedSettings {
  const current = readDisk();
  const gatewayUrl = normalizeGatewayUrl(input.gatewayUrl || current.gatewayUrl);
  let tokenRecord = current.token;
  if (typeof input.token === "string" && input.token.trim().length > 0) {
    tokenRecord = encodeToken(input.token.trim());
  }
  const lastAgentId = input.lastAgentId === undefined ? current.lastAgentId : input.lastAgentId;
  writeDisk({ gatewayUrl, token: tokenRecord, lastAgentId });
  return loadSettings();
}

export function hasCredentials(settings: LoadedSettings): boolean {
  return settings.gatewayUrl.length > 0 && settings.token.length > 0;
}
