import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join, sep as PathSep } from "node:path";
import { DEFAULT_GATEWAY_URL } from "../shared/types";
import { loadSettings, saveSettings } from "./settings";

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function collectRoots(): string[] {
  const roots: string[] = [];
  const add = (value: string | undefined): void => {
    if (value && !roots.includes(value)) roots.push(value);
  };
  add(process.cwd());
  try {
    add(app.getAppPath());
  } catch {
    // app.getAppPath() is unavailable until Electron is initialized
  }
  add(__dirname);
  return roots;
}

/** Candidate dirs for an optional local `.env` (dev shortcut only). */
function envCandidateDirs(): string[] {
  const dirs: string[] = [];
  const add = (value: string | undefined): void => {
    if (value && !dirs.includes(value)) dirs.push(value);
  };
  for (const root of collectRoots()) {
    add(root);
    // Dev build: __dirname is usually …/dist/main — also check the project root.
    if (root.includes(`${PathSep}dist${PathSep}`) || /[/\\]dist[/\\]/.test(root)) {
      add(join(root, "..", ".."));
    }
  }
  return dirs;
}

function findEnvFile(): string | null {
  for (const dir of envCandidateDirs()) {
    const envPath = join(dir, ".env");
    if (existsSync(envPath)) return envPath;
  }
  return null;
}

function readLocalEnv(): { gatewayUrl: string; token: string } | null {
  const path = findEnvFile();
  if (!path) return null;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const parsed = parseDotEnv(text);
  const gatewayUrl = (parsed.GROKBOT_GATEWAY_URL || parsed.SAND_GATEWAY_URL || "").trim();
  const token = (parsed.SAND_GATEWAY_TOKEN || "").trim();
  if (!gatewayUrl && !token) return null;
  return { gatewayUrl, token };
}

/** Fill empty Electron settings from a local .env. Existing settings win. Never logs secrets. */
export function importEnvSettings(): void {
  let fromEnv: { gatewayUrl: string; token: string } | null;
  try {
    fromEnv = readLocalEnv();
  } catch {
    return;
  }
  if (!fromEnv) return;
  const current = loadSettings();
  const missingToken = current.token.trim().length === 0;
  const missingUrl =
    current.gatewayUrl.trim().length === 0 || current.gatewayUrl === DEFAULT_GATEWAY_URL;
  if (!missingToken && !missingUrl) return;
  try {
    if (fromEnv.gatewayUrl && fromEnv.token && missingToken) {
      saveSettings({ gatewayUrl: fromEnv.gatewayUrl, token: fromEnv.token });
      return;
    }
    const gatewayUrl = missingUrl && fromEnv.gatewayUrl ? fromEnv.gatewayUrl : current.gatewayUrl;
    const token = missingToken && fromEnv.token ? fromEnv.token : undefined;
    if (gatewayUrl === current.gatewayUrl && !token) return;
    saveSettings({ gatewayUrl, token });
  } catch {
    // Invalid URL or encrypt failure: bootSession still runs and shows setup or a connect error.
  }
}
