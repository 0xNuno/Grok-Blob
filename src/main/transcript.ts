import type {
  ChatMessage,
  ChatReplyTo,
  ChatWidget,
  ChatWidgetField,
  ChatWidgetOption,
  MessageReaction,
} from "../shared/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  const obj = asRecord(content);
  if (obj) {
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.text === "string") return obj.text;
    return "";
  }
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    if (typeof rec.content === "string") parts.push(rec.content);
    else if (typeof rec.text === "string") parts.push(rec.text);
  }
  return parts.join("");
}

const SKIP_KINDS = new Set([
  "user-attachment",
  "tool",
  "tool-call",
  "system",
  "notice",
  "event",
  "feedback",
  "thinking",
  "metadata",
  "turn_ended",
]);

function roleOf(rec: Record<string, unknown>): "user" | "assistant" | null {
  if (rec.streaming === true) return null;
  const kind = typeof rec.kind === "string" ? rec.kind.toLowerCase() : "";
  // Live host: assistant turns are kind send-message, not role=assistant.
  if (kind === "send-message" || kind === "assistant-text") return "assistant";
  if (SKIP_KINDS.has(kind)) return null;

  const role = typeof rec.role === "string" ? rec.role.toLowerCase() : "";
  if (role === "user" || role === "human") return "user";
  if (role === "assistant" || role === "agent" || role === "bot") return "assistant";
  if (kind === "message") return "user";
  return null;
}

function textFromSendMessage(message: unknown): string {
  if (typeof message === "string") return message;
  const rec = asRecord(message);
  if (!rec) return "";
  // Live host: { type: "text", content: string }
  if (typeof rec.content === "string" && rec.content.trim()) return rec.content;
  if (typeof rec.text === "string" && rec.text.trim()) return rec.text;
  return textFromContent(rec.content);
}

function textOf(rec: Record<string, unknown>): string {
  const kind = typeof rec.kind === "string" ? rec.kind.toLowerCase() : "";
  if (kind === "send-message") {
    const fromSend = textFromSendMessage(rec.message);
    if (fromSend.trim()) return fromSend;
  }
  if (typeof rec.text === "string" && rec.text.trim()) return rec.text;
  if (typeof rec.body === "string" && rec.body.trim()) return rec.body;
  if (typeof rec.preview === "string" && rec.preview.trim()) return rec.preview;
  if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
  const message = asRecord(rec.message);
  if (message) {
    const fromMessage = textFromSendMessage(message) || textOf(message);
    if (fromMessage.trim()) return fromMessage;
  }
  const nested = asRecord(rec.entry);
  if (nested) {
    const inner = textOf(nested);
    if (inner.trim()) return inner;
  }
  return textFromContent(rec.content);
}

export function unwrapEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const rec = asRecord(payload);
  if (!rec) return [];
  if (Array.isArray(rec.entries)) return rec.entries;
  if (Array.isArray(rec.tail)) return rec.tail;
  if (Array.isArray(rec.messages)) return rec.messages;
  if (Array.isArray(rec.transcript)) return rec.transcript;
  return [];
}

export function previewText(text: string, max = 88): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(1, max - 1))}…`;
}

function pickId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (typeof rec.id === "string" && rec.id.trim()) return rec.id.trim();
  if (typeof rec.entryId === "string" && rec.entryId.trim()) return rec.entryId.trim();
  return undefined;
}

function replyToIdOf(rec: Record<string, unknown>, nested: Record<string, unknown>): string | undefined {
  const keys = ["replyToId", "reply_to", "replyTo"] as const;
  for (const src of [rec, nested]) {
    for (const key of keys) {
      const id = pickId(src[key]);
      if (id) return id;
    }
  }
  return undefined;
}

function clipField(value: unknown, max = 240): string {
  if (value == null) return "";
  if (typeof value === "string") return previewText(value, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function optionStyle(value: unknown): ChatWidgetOption["style"] | undefined {
  if (value === "primary" || value === "danger" || value === "default") return value;
  return undefined;
}

function parseOptions(value: unknown): ChatWidgetOption[] {
  if (!Array.isArray(value)) return [];
  const out: ChatWidgetOption[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      const label = item.trim();
      out.push({ label, value: label });
      continue;
    }
    const rec = asRecord(item);
    if (!rec) continue;
    const label = asText(rec.label).trim();
    if (!label) continue;
    const rawValue = asText(rec.value).trim();
    const description = asText(rec.description).trim();
    const style = optionStyle(rec.style);
    out.push({
      label,
      value: rawValue || label,
      ...(description ? { description } : {}),
      ...(style ? { style } : {}),
    });
  }
  return out.slice(0, 10);
}

function pendingFrom(status: string | undefined, explicit?: unknown): boolean {
  if (explicit === false || explicit === true) return explicit === true;
  if (!status) return true;
  const s = status.toLowerCase();
  if (["answered", "dismissed", "approved", "denied", "allow-once", "resolved", "done", "closed"].includes(s)) {
    return false;
  }
  return s === "pending" || s === "open" || s === "waiting";
}

function isStructuredDump(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(t) as unknown;
    const rec = asRecord(parsed);
    if (!rec) return true;
    const type = asText(rec.type).toLowerCase();
    return (
      type === "widget" ||
      type === "auto-review-approval" ||
      type === "local-tool-permission" ||
      type === "secret-request" ||
      type === "cursor-agent" ||
      asRecord(rec.widget) != null ||
      asRecord(rec.approval) != null ||
      asRecord(rec.secret) != null
    );
  } catch {
    return false;
  }
}

function widgetFromMessage(message: Record<string, unknown>, rec: Record<string, unknown>): ChatWidget | undefined {
  const type = asText(message.type).toLowerCase();
  const widgetRec = asRecord(message.widget);

  if (type === "widget" || widgetRec) {
    const src = widgetRec ?? message;
    const prompt = asText(src.prompt).trim() || asText(message.prompt).trim();
    const options = parseOptions(src.options ?? message.options);
    if (!prompt && options.length === 0) return undefined;
    const helpText = asText(src.helpText).trim() || asText(src.help).trim();
    const selected =
      asText(src.selected).trim() ||
      asText(src.value).trim() ||
      asText(src.response).trim() ||
      asText(rec.widgetResponse).trim();
    const status = asText(src.status).trim() || (selected ? "answered" : "pending");
    const dismissed = src.dismissed === true || status.toLowerCase() === "dismissed";
    return {
      kind: "choice",
      prompt: prompt || "choose",
      ...(helpText ? { helpText } : {}),
      ...(options.length ? { options } : {}),
      allowCustom: src.allowCustom === true,
      pending: !dismissed && pendingFrom(status, selected ? false : src.pending),
      status: dismissed ? "dismissed" : status,
      ...(selected ? { selected } : {}),
    };
  }

  if (type === "auto-review-approval") {
    const approval = asRecord(message.approval) ?? {};
    const status = asText(approval.status).trim() || "pending";
    const fields: ChatWidgetField[] = [];
    const pairs: Array<[string, unknown]> = [
      ["action", approval.summary],
      ["command", approval.command],
      ["reason", approval.reason],
      ["proposed rule", approval.proposedRule],
      ["surface", approval.surface],
    ];
    for (const [label, value] of pairs) {
      const text = clipField(value);
      if (text) fields.push({ label, value: text });
    }
    const requestId = asText(approval.requestId).trim();
    return {
      kind: "approval",
      prompt: asText(approval.summary).trim() || "approval required",
      fields,
      pending: pendingFrom(status),
      status,
      gate: "auto-review",
      ...(requestId ? { requestId } : {}),
    };
  }

  if (type === "local-tool-permission") {
    const ask = asRecord(message.ask) ?? {};
    const status = asText(ask.status).trim() || "pending";
    const fields: ChatWidgetField[] = [];
    const pairs: Array<[string, unknown]> = [
      ["action", ask.action],
      ["target", ask.target],
      ["description", ask.description],
    ];
    for (const [label, value] of pairs) {
      const text = clipField(value);
      if (text) fields.push({ label, value: text });
    }
    const requestId = asText(ask.requestId).trim();
    return {
      kind: "approval",
      prompt: asText(ask.action).trim() || "computer permission required",
      fields,
      pending: pendingFrom(status),
      status,
      gate: "local-tool",
      ...(requestId ? { requestId } : {}),
    };
  }

  if (type === "secret-request") {
    const secret = asRecord(message.secret) ?? message;
    const label = asText(secret.label).trim() || "secret requested";
    const description = asText(secret.description).trim();
    return {
      kind: "secret",
      prompt: label,
      helpText: description || "open Grok Bot to provide this. Blob does not collect secrets.",
      pending: false,
      status: "host-only",
    };
  }

  if (type === "cursor-agent") {
    const bcId = asText(message.bcId).trim();
    return {
      kind: "cursor-agent",
      prompt: "cursor cloud agent",
      ...(bcId ? { helpText: bcId } : {}),
      pending: false,
      status: "card",
    };
  }

  return undefined;
}

function reactionsFrom(value: unknown): MessageReaction[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    const out: MessageReaction[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.trim()) {
        const existing = out.find((r) => r.emoji === item.trim());
        if (existing) existing.count += 1;
        else out.push({ emoji: item.trim(), count: 1 });
        continue;
      }
      const rec = asRecord(item);
      if (!rec) continue;
      const emoji = asText(rec.emoji).trim() || asText(rec.reaction).trim() || asText(rec.name).trim();
      if (!emoji) continue;
      const countRaw = rec.count;
      const count =
        typeof countRaw === "number" && Number.isFinite(countRaw) && countRaw > 0
          ? Math.round(countRaw)
          : Array.isArray(rec.users)
            ? rec.users.length
            : 1;
      const mine = rec.mine === true || rec.me === true || rec.reacted === true;
      out.push({ emoji, count: Math.max(1, count), ...(mine ? { mine: true } : {}) });
    }
    return out;
  }
  const rec = asRecord(value);
  if (!rec) return [];
  const out: MessageReaction[] = [];
  for (const [emoji, payload] of Object.entries(rec)) {
    if (!emoji.trim()) continue;
    if (typeof payload === "number" && Number.isFinite(payload) && payload > 0) {
      out.push({ emoji, count: Math.round(payload) });
      continue;
    }
    if (Array.isArray(payload)) {
      out.push({ emoji, count: Math.max(1, payload.length) });
      continue;
    }
    const inner = asRecord(payload);
    if (!inner) continue;
    const countRaw = inner.count;
    const count =
      typeof countRaw === "number" && Number.isFinite(countRaw) && countRaw > 0
        ? Math.round(countRaw)
        : Array.isArray(inner.users)
          ? inner.users.length
          : 1;
    const mine = inner.mine === true || inner.me === true;
    out.push({ emoji, count: Math.max(1, count), ...(mine ? { mine: true } : {}) });
  }
  return out;
}

function reactionsOf(rec: Record<string, unknown>, nested: Record<string, unknown>): MessageReaction[] {
  const message = asRecord(nested.message) ?? asRecord(rec.message);
  for (const src of [rec.reactions, nested.reactions, message?.reactions]) {
    const list = reactionsFrom(src);
    if (list.length) return list;
  }
  return [];
}

export function messagesFromTranscript(payload: unknown): ChatMessage[] {
  const out: ChatMessage[] = [];
  let index = 0;
  for (const item of unwrapEntries(payload)) {
    const rec = asRecord(item);
    if (!rec) continue;
    const nested = asRecord(rec.entry) ?? rec;
    const role = roleOf(nested) ?? roleOf(rec);
    const message = asRecord(nested.message) ?? asRecord(rec.message);
    const widget = message ? widgetFromMessage(message, rec) : undefined;
    let text = (textOf(nested) || textOf(rec)).trim();
    if (text && isStructuredDump(text)) {
      text = widget?.prompt ?? "";
    }
    if (!role) continue;
    if (!text && !widget) continue;
    if (!text && widget) text = widget.prompt;
    const id =
      (typeof rec.id === "string" && rec.id) ||
      (typeof nested.id === "string" && nested.id) ||
      `m-${index}`;
    const replyToId = replyToIdOf(rec, nested);
    const reactions = reactionsOf(rec, nested);
    const msg: ChatMessage = { id, role, text };
    if (replyToId) msg.replyToId = replyToId;
    if (reactions.length) msg.reactions = reactions;
    if (widget) msg.widget = widget;
    out.push(msg);
    index += 1;
  }

  const byId = new Map<string, ChatMessage>();
  for (const msg of out) byId.set(msg.id, msg);
  for (const msg of out) {
    if (!msg.replyToId) continue;
    const parent = byId.get(msg.replyToId);
    const quote: ChatReplyTo = {
      id: msg.replyToId,
      text: parent ? previewText(parent.text || parent.widget?.prompt || "") : "earlier message",
    };
    if (parent?.role) quote.role = parent.role;
    msg.replyTo = quote;
  }
  return out;
}

export function latestAssistantText(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].text.trim()) return messages[i].text;
  }
  return null;
}
