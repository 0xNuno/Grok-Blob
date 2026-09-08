import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { AgentRow } from "../shared/types";
import { THE_FIRST_ID } from "../shared/types";
import { redactSecret } from "./redact";

export type SendPromptOpts = {
  replyToId?: string;
  /** Host-local filesystem paths. Ignored by a remote gateway that cannot read this Mac. */
  attachmentPaths?: string[];
  attachmentNames?: string[];
};

export type ReactInput = {
  entryId: string;
  emoji: string;
  agentId?: string;
};

export type WidgetInput = {
  entryId: string;
  value: string;
  agentId?: string;
};

export type DismissInput = {
  entryId: string;
  agentId?: string;
};

export type GateInput = {
  entryId: string;
  requestId: string;
  agentId: string;
  gate: "auto-review" | "local-tool";
  approved: boolean;
};

export type GatewaySession = {
  listAgents: () => Promise<AgentRow[]>;
  sendPrompt: (agentId: string, prompt: string, opts?: SendPromptOpts) => Promise<{ accepted: true }>;
  getAgentTranscriptTail: (id: string, limit: number) => Promise<unknown>;
  health: () => Promise<{ ok: boolean }>;
  reactToMessage: (input: ReactInput) => Promise<void>;
  respondToWidget: (input: WidgetInput) => Promise<{ accepted: boolean }>;
  dismissWidget: (input: DismissInput) => Promise<{ accepted: boolean }>;
  resolveGate: (input: GateInput) => Promise<void>;
};

type SdkBot = {
  listAgents: () => Promise<unknown>;
  sendPrompt: (body: {
    agentId: string;
    prompt: string;
    replyToId?: string;
    attachmentPaths?: string[];
    attachmentNames?: string[];
  }) => Promise<{ accepted: true }>;
  getAgentTranscriptTail: (body: { id: string; limit: number }) => Promise<unknown>;
  health: () => Promise<{ ok: boolean }>;
  reactToMessage?: (body: { entryId: string; emoji: string; agentId?: string }) => Promise<unknown>;
  respondToWidget?: (body: {
    entryId: string;
    value: string;
    agentId?: string;
  }) => Promise<{ accepted?: boolean }>;
  dismissWidget?: (body: { entryId: string; agentId?: string }) => Promise<{ accepted?: boolean }>;
};

const requireFromMain = createRequire(__filename);

function asAgentRows(payload: unknown): AgentRow[] {
  const list = Array.isArray(payload)
    ? payload
    : payload != null &&
        typeof payload === "object" &&
        Array.isArray((payload as { agents?: unknown }).agents)
      ? ((payload as { agents: unknown[] }).agents)
      : [];
  const rows: AgentRow[] = [];
  for (const item of list) {
    if (item == null || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string") continue;
    const name =
      typeof rec.name === "string" && rec.name.trim().length > 0
        ? rec.name
        : typeof rec.title === "string" && rec.title.trim().length > 0
          ? rec.title
          : "";
    if (!name) continue;
    rows.push({
      id: rec.id,
      name,
      isGroup: rec.isGroup === true,
      isRunning: rec.isRunning === true,
      isComposingMessage: rec.isComposingMessage === true,
      awaitingUserResponse: rec.awaitingUserResponse === true,
    });
  }
  return rows;
}

function acceptedOf(data: unknown, label: string): { accepted: boolean } {
  const rec = data != null && typeof data === "object" ? (data as { accepted?: unknown }) : null;
  if (rec && rec.accepted === false) throw new Error(`${label} was not accepted.`);
  return { accepted: true };
}

async function postJson(
  gatewayUrl: string,
  token: string,
  path: string,
  body: unknown,
  auth: boolean,
): Promise<unknown> {
  const requestId = randomUUID();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sand-request-id": requestId,
  };
  if (auth) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${gatewayUrl}${path}`, {
      method: path === "/health" ? "GET" : "POST",
      headers,
      body: path === "/health" ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactSecret(message, token));
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed.error === "string") detail = parsed.error;
    } catch {
      if (text) detail = text.slice(0, 180);
    }
    throw new Error(redactSecret(detail, token));
  }
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Gateway returned non-JSON.");
  }
}

function fetchSession(gatewayUrl: string, token: string): GatewaySession {
  return {
    health: async () => {
      const data = (await postJson(gatewayUrl, token, "/health", undefined, false)) as {
        ok?: boolean;
      };
      return { ok: data?.ok === true };
    },
    listAgents: async () =>
      asAgentRows(await postJson(gatewayUrl, token, "/api/listAgents", {}, true)),
    sendPrompt: async (agentId, prompt, opts) => {
      const body: Record<string, unknown> = { agentId, prompt };
      if (opts?.replyToId) body.replyToId = opts.replyToId;
      if (opts?.attachmentPaths && opts.attachmentPaths.length > 0) {
        body.attachmentPaths = opts.attachmentPaths;
        if (opts.attachmentNames && opts.attachmentNames.length > 0) {
          body.attachmentNames = opts.attachmentNames;
        }
      }
      const data = (await postJson(gatewayUrl, token, "/api/sendPrompt", body, true)) as {
        accepted?: boolean;
      };
      if (data?.accepted !== true) throw new Error("sendPrompt was not accepted.");
      return { accepted: true };
    },
    getAgentTranscriptTail: async (id, limit) =>
      postJson(gatewayUrl, token, "/api/getAgentTranscriptTail", { id, limit }, true),
    reactToMessage: async (input) => {
      await postJson(
        gatewayUrl,
        token,
        "/api/reactToMessage",
        { entryId: input.entryId, emoji: input.emoji, ...(input.agentId ? { agentId: input.agentId } : {}) },
        true,
      );
    },
    respondToWidget: async (input) => {
      const data = await postJson(
        gatewayUrl,
        token,
        "/api/respondToWidget",
        { entryId: input.entryId, value: input.value, ...(input.agentId ? { agentId: input.agentId } : {}) },
        true,
      );
      return acceptedOf(data, "respondToWidget");
    },
    dismissWidget: async (input) => {
      const data = await postJson(
        gatewayUrl,
        token,
        "/api/dismissWidget",
        { entryId: input.entryId, ...(input.agentId ? { agentId: input.agentId } : {}) },
        true,
      );
      return acceptedOf(data, "dismissWidget");
    },
    resolveGate: async (input) => {
      if (input.gate === "auto-review") {
        await postJson(
          gatewayUrl,
          token,
          "/api/resolveAutoReviewApproval",
          {
            agentId: input.agentId,
            entryId: input.entryId,
            requestId: input.requestId,
            resolution: input.approved ? "approved" : "denied",
          },
          true,
        );
        return;
      }
      await postJson(
        gatewayUrl,
        token,
        "/api/resolveLocalToolPermission",
        {
          agentId: input.agentId,
          entryId: input.entryId,
          requestId: input.requestId,
          resolution: input.approved ? "allow-once" : "deny",
        },
        true,
      );
    },
  };
}

function trySdk(gatewayUrl: string, token: string): GatewaySession | null {
  try {
    const mod = requireFromMain("@adam91holt/grokbot-sdk") as {
      GrokBot: new (opts: { gatewayUrl: string; token: string }) => SdkBot;
    };
    if (typeof mod.GrokBot !== "function") return null;
    const bot = new mod.GrokBot({ gatewayUrl, token });
    const fetch = fetchSession(gatewayUrl, token);
    return {
      listAgents: async () => asAgentRows(await bot.listAgents()),
      sendPrompt: async (agentId, prompt, opts) =>
        bot.sendPrompt({
          agentId,
          prompt,
          ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
          ...(opts?.attachmentPaths && opts.attachmentPaths.length > 0
            ? {
                attachmentPaths: opts.attachmentPaths,
                ...(opts.attachmentNames && opts.attachmentNames.length > 0
                  ? { attachmentNames: opts.attachmentNames }
                  : {}),
              }
            : {}),
        }),
      getAgentTranscriptTail: async (id, limit) => bot.getAgentTranscriptTail({ id, limit }),
      health: async () => bot.health(),
      reactToMessage: async (input) => {
        if (typeof bot.reactToMessage === "function") {
          await bot.reactToMessage(input);
          return;
        }
        await fetch.reactToMessage(input);
      },
      respondToWidget: async (input) => {
        if (typeof bot.respondToWidget === "function") {
          return acceptedOf(await bot.respondToWidget(input), "respondToWidget");
        }
        return fetch.respondToWidget(input);
      },
      dismissWidget: async (input) => {
        if (typeof bot.dismissWidget === "function") {
          return acceptedOf(await bot.dismissWidget(input), "dismissWidget");
        }
        return fetch.dismissWidget(input);
      },
      resolveGate: (input) => fetch.resolveGate(input),
    };
  } catch {
    return null;
  }
}

export function createGateway(gatewayUrl: string, token: string): GatewaySession {
  return trySdk(gatewayUrl, token) ?? fetchSession(gatewayUrl, token);
}

export function pickDefaultAgent(agents: AgentRow[], lastId: string | null): AgentRow | null {
  if (agents.length === 0) return null;
  const last = lastId ? agents.find((a) => a.id === lastId) : undefined;
  if (last) return last;
  const first = agents.find((a) => a.id === THE_FIRST_ID);
  if (first) return first;
  return agents.find((a) => !a.isGroup) ?? agents[0] ?? null;
}

export async function waitUntilIdle(
  session: GatewaySession,
  agentId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<AgentRow> {
  const intervalMs = opts.intervalMs ?? 800;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const started = Date.now();
  for (;;) {
    const agents = await session.listAgents();
    const row = agents.find((a) => a.id === agentId);
    if (!row) throw new Error("Agent disappeared from the roster.");
    if (!row.isRunning && !row.isComposingMessage) return row;
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for a reply.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
