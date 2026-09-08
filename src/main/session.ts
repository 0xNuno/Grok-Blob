import type { AgentRow, ChatMessage, MessageReaction, SheetState } from "../shared/types";
import { DEFAULT_GATEWAY_URL } from "../shared/types";
import { Ipc } from "../shared/ipc";
import { createGateway, pickDefaultAgent, waitUntilIdle, type GatewaySession } from "./gateway";
import { importEnvSettings } from "./env";
import { hasCredentials, loadSettings, saveSettings } from "./settings";
import { messagesFromTranscript, previewText } from "./transcript";
import { isHotkeyTaken } from "./hotkey";
import { publicGatewayWarning, redactSecret } from "./redact";
import { getWindow } from "./window";
import {
  attachFromClipboard,
  capture,
  listPending,
  peekPending,
  removePending,
  scheduleUnlink,
  takePending,
  type CaptureMode,
} from "./attachments";

const TAIL_LIMIT = 80;

type Runtime = {
  configured: boolean;
  gatewayUrl: string;
  agents: AgentRow[];
  agentId: string | null;
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  warning: string | null;
  status: string;
  session: GatewaySession | null;
};

const runtime: Runtime = {
  configured: false,
  gatewayUrl: DEFAULT_GATEWAY_URL,
  agents: [],
  agentId: null,
  messages: [],
  busy: false,
  error: null,
  warning: null,
  status: "",
  session: null,
};

function tokenForErrors(): string | undefined {
  try {
    const loaded = loadSettings();
    return loaded.token || undefined;
  } catch {
    return undefined;
  }
}

function fail(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactSecret(message, tokenForErrors());
}

function noteGatewayUrl(url: string): void {
  runtime.warning = publicGatewayWarning(url);
}

function causeText(err: unknown): string {
  if (!(err instanceof Error) || !("cause" in err) || err.cause == null) return "";
  const cause = err.cause;
  if (cause instanceof Error) return `${cause.message} ${cause.name}`;
  return String(cause);
}

function describeConnectError(err: unknown): string {
  const message = fail(err);
  const blob = `${message} ${causeText(err)}`.toLowerCase();
  if (
    /\b401\b/.test(blob) ||
    blob.includes("unauthorized") ||
    blob.includes("invalid token") ||
    blob.includes("forbidden") ||
    /\b403\b/.test(blob)
  ) {
    return "Bad token.";
  }
  if (
    blob.includes("econnrefused") ||
    blob.includes("enotfound") ||
    blob.includes("ehostunreach") ||
    blob.includes("enodedata") ||
    blob.includes("gateway down")
  ) {
    return "Gateway down.";
  }
  if (
    blob.includes("fetch failed") ||
    blob.includes("failed to fetch") ||
    blob.includes("networkerror") ||
    blob.includes("econnreset") ||
    blob.includes("etimedout") ||
    blob.includes("und_err") ||
    blob.includes("socket")
  ) {
    return "Fetch failed.";
  }
  if (blob.includes("health")) return "Gateway down.";
  return message;
}

const localReactions = new Map<string, Map<string, MessageReaction[]>>();

function reactionsFor(agentId: string): Map<string, MessageReaction[]> {
  let map = localReactions.get(agentId);
  if (!map) {
    map = new Map();
    localReactions.set(agentId, map);
  }
  return map;
}

function toggleLocalReaction(agentId: string, entryId: string, emoji: string): void {
  const map = reactionsFor(agentId);
  const cur = map.get(entryId) ?? [];
  const idx = cur.findIndex((row) => row.emoji === emoji);
  let next: MessageReaction[];
  if (idx >= 0) {
    const row = cur[idx];
    if (row.mine) {
      const count = row.count - 1;
      next = count <= 0 ? cur.filter((_, i) => i !== idx) : cur.map((x, i) => (i === idx ? { emoji, count, mine: false } : x));
    } else {
      next = cur.map((x, i) => (i === idx ? { ...x, count: x.count + 1, mine: true } : x));
    }
  } else {
    next = [...cur, { emoji, count: 1, mine: true }];
  }
  map.set(entryId, next);
}

function mergeReactions(agentId: string, messages: ChatMessage[]): ChatMessage[] {
  const map = localReactions.get(agentId);
  if (!map) return messages;
  return messages.map((msg) => {
    if (msg.reactions && msg.reactions.length > 0) {
      map.set(msg.id, msg.reactions);
      return msg;
    }
    const overlay = map.get(msg.id);
    if (!overlay || overlay.length === 0) return msg;
    return { ...msg, reactions: overlay };
  });
}

function emitState(): void {
  try {
    const w = getWindow();
    if (w && !w.isDestroyed()) w.webContents.send(Ipc.state, snapshot());
  } catch {
    // Window is created after boot; sendPrompt may also race hide/destroy.
  }
}

export function snapshot(): SheetState {
  const loaded = loadSettings();
  return {
    configured: runtime.configured,
    settings: { gatewayUrl: runtime.gatewayUrl, tokenSet: loaded.token.length > 0 },
    agents: runtime.agents,
    agentId: runtime.agentId,
    messages: runtime.messages,
    busy: runtime.busy,
    error: runtime.error,
    warning: runtime.warning,
    hotkeyTaken: isHotkeyTaken(),
    status: runtime.status,
    attachments: listPending(),
  };
}

async function refreshRoster(session: GatewaySession): Promise<void> {
  runtime.agents = await session.listAgents();
  const loaded = loadSettings();
  const picked = pickDefaultAgent(runtime.agents, runtime.agentId ?? loaded.lastAgentId);
  runtime.agentId = picked?.id ?? null;
  if (runtime.agentId) saveSettings({ gatewayUrl: loaded.gatewayUrl, lastAgentId: runtime.agentId });
}

async function loadTail(session: GatewaySession, agentId: string): Promise<void> {
  const tail = await session.getAgentTranscriptTail(agentId, TAIL_LIMIT);
  runtime.messages = mergeReactions(agentId, messagesFromTranscript(tail));
}

export async function bootSession(): Promise<SheetState> {
  importEnvSettings();
  const loaded = loadSettings();
  runtime.gatewayUrl = loaded.gatewayUrl || DEFAULT_GATEWAY_URL;
  runtime.configured = hasCredentials(loaded);
  runtime.error = null;
  runtime.status = "";
  runtime.session = null;
  noteGatewayUrl(runtime.gatewayUrl);
  runtime.agents = [];
  runtime.messages = [];
  if (!runtime.configured) return snapshot();
  try {
    const session = createGateway(loaded.gatewayUrl, loaded.token);
    runtime.session = session;
    await refreshRoster(session);
    if (runtime.agentId) await loadTail(session, runtime.agentId);
  } catch (err) {
    runtime.error = fail(err);
    runtime.configured = true;
  }
  return snapshot();
}

export async function persistSettings(input: { gatewayUrl: string; token?: string }): Promise<SheetState> {
  const saved = saveSettings(input);
  runtime.gatewayUrl = saved.gatewayUrl;
  runtime.error = null;
  runtime.status = "connecting";
  noteGatewayUrl(saved.gatewayUrl);
  if (!hasCredentials(saved)) {
    runtime.configured = false;
    runtime.session = null;
    runtime.error = "Gateway URL and token are required.";
    runtime.status = "error";
    return snapshot();
  }
  emitState();
  try {
    const session = createGateway(saved.gatewayUrl, saved.token);
    const health = await session.health();
    if (!health.ok) throw new Error("Gateway down.");
    runtime.session = session;
    runtime.configured = true;
    await refreshRoster(session);
    if (runtime.agentId) await loadTail(session, runtime.agentId);
    runtime.status = "connected";
    runtime.error = null;
    noteGatewayUrl(saved.gatewayUrl);
  } catch (err) {
    runtime.session = null;
    runtime.configured = false;
    runtime.error = describeConnectError(err);
    runtime.status = "error";
  }
  return snapshot();
}

export async function chooseAgent(id: string): Promise<SheetState> {
  runtime.agentId = id;
  const loaded = loadSettings();
  saveSettings({ gatewayUrl: loaded.gatewayUrl, lastAgentId: id });
  if (!runtime.session) return snapshot();
  try {
    runtime.error = null;
    await loadTail(runtime.session, id);
  } catch (err) {
    runtime.error = fail(err);
  }
  return snapshot();
}

async function refreshFromHost(session: GatewaySession): Promise<void> {
  await refreshRoster(session);
  if (runtime.agentId) await loadTail(session, runtime.agentId);
}

export async function reloadTranscript(): Promise<SheetState> {
  if (!runtime.session) return snapshot();
  try {
    runtime.error = null;
    await refreshFromHost(runtime.session);
  } catch (err) {
    runtime.error = fail(err);
  }
  return snapshot();
}

let syncInFlight = false;

export async function syncWithHost(): Promise<SheetState> {
  if (syncInFlight) return snapshot();
  syncInFlight = true;
  runtime.error = null;
  runtime.status = "syncing";
  emitState();
  try {
    const loaded = loadSettings();
    runtime.gatewayUrl = loaded.gatewayUrl || DEFAULT_GATEWAY_URL;
    runtime.configured = hasCredentials(loaded);
    if (!runtime.configured) {
      runtime.error = "Gateway URL and token are required.";
      runtime.status = "error";
      return snapshot();
    }
    const connect = (): GatewaySession => {
      const session = createGateway(loaded.gatewayUrl, loaded.token);
      runtime.session = session;
      return session;
    };
    const hadSession = runtime.session != null;
    let session = runtime.session ?? connect();
    try {
      await refreshFromHost(session);
    } catch (err) {
      if (!hadSession) throw err;
      session = connect();
      await refreshFromHost(session);
    }
    runtime.status = "";
    runtime.error = null;
  } catch (err) {
    runtime.error = describeConnectError(err);
    runtime.status = "error";
  } finally {
    syncInFlight = false;
  }
  return snapshot();
}

function requireSession(): { gw: GatewaySession; agentId: string } {
  if (!runtime.session || !runtime.agentId) {
    throw new Error("No agent selected.");
  }
  return { gw: runtime.session, agentId: runtime.agentId };
}

async function settleTurn(gw: GatewaySession, agentId: string): Promise<void> {
  runtime.status = "waiting";
  emitState();
  await waitUntilIdle(gw, agentId);
  runtime.status = "reading";
  emitState();
  await loadTail(gw, agentId);
  runtime.status = "idle";
  await refreshRoster(gw);
}

/** Bumped when a new accepted turn supersedes an in-flight settle follow-up. */
let settleGen = 0;

/**
 * Wait for host idle + refresh transcript in the background.
 * IPC returns after accept so the renderer can clear `sending` immediately;
 * working face stays via runtime.busy / status until this finishes.
 */
function followSettleTurn(gw: GatewaySession, agentId: string): void {
  const gen = ++settleGen;
  void (async () => {
    try {
      await settleTurn(gw, agentId);
      if (gen !== settleGen) return;
      runtime.busy = false;
      emitState();
    } catch (err) {
      if (gen !== settleGen) return;
      runtime.error = fail(err);
      runtime.status = "error";
      runtime.busy = false;
      emitState();
    }
  })();
}

export async function sendPrompt(prompt: string, replyToId?: string): Promise<SheetState> {
  const text = prompt.trim();
  const held = peekPending();
  if (!text && held.length === 0) {
    runtime.error = "Prompt is empty.";
    return snapshot();
  }
  if (!runtime.session || !runtime.agentId) {
    runtime.error = "No agent selected.";
    return snapshot();
  }
  const gw = runtime.session;
  const agentId = runtime.agentId;
  const sendText = text || "(screenshot)";
  runtime.busy = true;
  runtime.error = null;
  runtime.status = "sending";
  const parent = replyToId ? runtime.messages.find((msg) => msg.id === replyToId) : undefined;
  const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", text: sendText };
  if (replyToId) {
    optimistic.replyToId = replyToId;
    optimistic.replyTo = {
      id: replyToId,
      text: parent ? previewText(parent.text || parent.widget?.prompt || "") : "earlier message",
      ...(parent?.role ? { role: parent.role } : {}),
    };
  }
  runtime.messages = [...runtime.messages, optimistic];
  emitState();
  const attachOpts =
    held.length > 0
      ? {
          attachmentPaths: held.map((a) => a.filePath),
          attachmentNames: held.map((_item, i) => `screenshot-${i + 1}.png`),
        }
      : {};
  const replyOpts = replyToId ? { replyToId } : {};
  try {
    try {
      const accepted = await gw.sendPrompt(agentId, sendText, { ...replyOpts, ...attachOpts });
      if (accepted.accepted !== true) throw new Error("sendPrompt was not accepted.");
    } catch (err) {
      if (held.length === 0) throw err;
      // Host may reject a path it cannot read (remote / tunneled gateway). Retry text-only.
      const accepted = await gw.sendPrompt(agentId, sendText, replyOpts);
      if (accepted.accepted !== true) throw err;
    }
    const taken = takePending();
    // Host may still read attachmentPaths after accept; delay unlink. Drop/clear uses unlinkNow.
    for (const item of taken) scheduleUnlink(item.filePath);
    // Accepted: unlock composer IPC now. Keep busy/waiting for working face;
    // settleTurn runs in the background and emitState when idle arrives.
    runtime.status = "waiting";
    emitState();
    followSettleTurn(gw, agentId);
    return snapshot();
  } catch (err) {
    settleGen += 1; // cancel any stale follow-up from a prior turn
    runtime.error = fail(err);
    runtime.status = "error";
    runtime.busy = false;
    emitState();
    return snapshot();
  }
}

export async function captureSheet(mode: CaptureMode): Promise<SheetState> {
  runtime.error = null;
  const result = await capture(mode);
  if (!result.ok && result.reason && !/^Capture cancelled\.?$/i.test(result.reason)) {
    runtime.error = result.reason;
  }
  emitState();
  return snapshot();
}

export function attachClipboardImage(): SheetState {
  runtime.error = null;
  const result = attachFromClipboard();
  if (!result.ok && result.reason) runtime.error = result.reason;
  emitState();
  return snapshot();
}

export function dropAttachment(id: string): SheetState {
  removePending(String(id));
  emitState();
  return snapshot();
}

export async function reactToMessage(entryId: string, emoji: string): Promise<SheetState> {
  const id = entryId.trim();
  const face = emoji.trim();
  if (!id || !face) {
    runtime.error = "Reaction is empty.";
    return snapshot();
  }
  try {
    const { gw, agentId } = requireSession();
    runtime.error = null;
    toggleLocalReaction(agentId, id, face);
    runtime.messages = mergeReactions(agentId, runtime.messages);
    emitState();
    await gw.reactToMessage({ entryId: id, emoji: face, agentId });
    await loadTail(gw, agentId);
  } catch (err) {
    runtime.error = fail(err);
  }
  return snapshot();
}

async function runHostAction(work: (gw: GatewaySession, agentId: string) => Promise<void>): Promise<SheetState> {
  if (!runtime.session || !runtime.agentId) {
    runtime.error = "No agent selected.";
    return snapshot();
  }
  const gw = runtime.session;
  const agentId = runtime.agentId;
  runtime.busy = true;
  runtime.error = null;
  runtime.status = "sending";
  emitState();
  try {
    await work(gw, agentId);
    // Same as sendPrompt: do not hold IPC across waitUntilIdle.
    runtime.status = "waiting";
    emitState();
    followSettleTurn(gw, agentId);
    return snapshot();
  } catch (err) {
    settleGen += 1;
    runtime.error = fail(err);
    runtime.status = "error";
    runtime.busy = false;
    emitState();
    return snapshot();
  }
}

export async function respondToWidget(entryId: string, value: string): Promise<SheetState> {
  const id = entryId.trim();
  const text = value.trim();
  if (!id || !text) {
    runtime.error = "Choice is empty.";
    return snapshot();
  }
  return runHostAction(async (gw, agentId) => {
    const accepted = await gw.respondToWidget({ entryId: id, value: text, agentId });
    if (accepted.accepted === false) throw new Error("respondToWidget was not accepted.");
  });
}

export async function dismissWidget(entryId: string): Promise<SheetState> {
  const id = entryId.trim();
  if (!id) {
    runtime.error = "Widget is missing.";
    return snapshot();
  }
  return runHostAction(async (gw, agentId) => {
    const accepted = await gw.dismissWidget({ entryId: id, agentId });
    if (accepted.accepted === false) throw new Error("dismissWidget was not accepted.");
  });
}

export async function resolveGate(
  entryId: string,
  requestId: string,
  gate: "auto-review" | "local-tool",
  approved: boolean,
): Promise<SheetState> {
  const id = entryId.trim();
  const rid = requestId.trim();
  if (!id || !rid) {
    runtime.error = "Approval is missing.";
    return snapshot();
  }
  return runHostAction(async (gw, agentId) => {
    await gw.resolveGate({ entryId: id, requestId: rid, agentId, gate, approved });
  });
}

export function showSettings(): SheetState {
  // Stay configured so the renderer can return to chat without reconnecting.
  runtime.error = null;
  runtime.status = "";
  noteGatewayUrl(runtime.gatewayUrl);
  return snapshot();
}

export async function refreshRosterOnly(): Promise<SheetState> {
  if (!runtime.session) return snapshot();
  try {
    runtime.agents = await runtime.session.listAgents();
  } catch {
    // Background poll must not clobber chat errors or the current selection.
  }
  return snapshot();
}

