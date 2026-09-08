import { app } from "electron";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { IN_FLIGHT_STATUSES } from "../shared/activity-chron";
import { MINE_SCHEMA, type ActivityTask, type MineFeed } from "../shared/types";
import { parseTasks } from "./activity";

function minePath(): string {
  return join(app.getPath("userData"), "mine-tasks.json");
}

function dismissedPath(): string {
  return join(app.getPath("userData"), "dismissed-mine.json");
}

type DismissedMap = Record<string, { updatedAt: string; dismissedAt: string }>;

function stampPriorities(tasks: ActivityTask[]): ActivityTask[] {
  return tasks.map((task, index) => ({ ...task, priority: index }));
}

function documentFor(tasks: ActivityTask[]): string {
  return JSON.stringify({ schema: MINE_SCHEMA, tasks: stampPriorities(tasks) }, null, 2) + "\n";
}

function writeTasksFile(path: string, tasks: ActivityTask[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, documentFor(tasks), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that ignore chmod
  }
}

function readFileTasks(path: string): ActivityTask[] {
  if (!existsSync(path)) return [];
  try {
    return parseTasks(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return [];
  }
}

function readDismissed(): DismissedMap {
  const path = dismissedPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { ids?: unknown };
    const ids =
      raw != null && typeof raw === "object" && raw.ids != null && typeof raw.ids === "object"
        ? (raw.ids as Record<string, unknown>)
        : {};
    const out: DismissedMap = {};
    for (const [id, rec] of Object.entries(ids)) {
      if (!id || rec == null || typeof rec !== "object") continue;
      const row = rec as Record<string, unknown>;
      if (typeof row.updatedAt !== "string" || typeof row.dismissedAt !== "string") continue;
      out[id] = { updatedAt: row.updatedAt, dismissedAt: row.dismissedAt };
    }
    return out;
  } catch {
    return {};
  }
}

function writeDismissed(ids: DismissedMap): void {
  const path = dismissedPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ids }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort
  }
}

function applyDismissals(tasks: ActivityTask[]): ActivityTask[] {
  const dismissed = readDismissed();
  let dirty = false;
  const kept: ActivityTask[] = [];
  for (const task of tasks) {
    const rec = dismissed[task.id];
    if (!rec) {
      kept.push(task);
      continue;
    }
    const newer = Date.parse(task.updatedAt) > Date.parse(rec.updatedAt);
    if (newer && IN_FLIGHT_STATUSES.has(task.status)) {
      delete dismissed[task.id];
      dirty = true;
      kept.push(task);
      continue;
    }
  }
  if (dirty) writeDismissed(dismissed);
  return kept;
}

function asMine(tasks: ActivityTask[]): MineFeed {
  return { schema: MINE_SCHEMA, tasks, source: "userData" };
}

/** Personal Mine feed — same task shape as Activity, separate file + dismiss map. */
export function readMineTasks(): MineFeed {
  return asMine(applyDismissals(readFileTasks(minePath())));
}

export function setMineTasks(input: unknown): MineFeed {
  const tasks = stampPriorities(parseTasks(input)).map((task) => {
    const next: ActivityTask = {
      ...task,
      agentName: task.agentName?.trim() || "me",
    };
    delete next.agentId;
    return next;
  });
  writeTasksFile(minePath(), tasks);
  return readMineTasks();
}

export function dismissMineTask(id: unknown): MineFeed {
  const want = String(id ?? "").trim();
  if (!want) return readMineTasks();
  const visible = readMineTasks().tasks.find((task) => task.id === want);
  const dismissed = readDismissed();
  dismissed[want] = {
    updatedAt: visible?.updatedAt ?? new Date().toISOString(),
    dismissedAt: new Date().toISOString(),
  };
  writeDismissed(dismissed);
  return readMineTasks();
}

function newMineId(): string {
  return `mine-${randomBytes(4).toString("hex")}`;
}

export function addMineTask(title: unknown): MineFeed {
  const text = String(title ?? "").trim();
  if (!text) return readMineTasks();
  const now = new Date().toISOString();
  const task: ActivityTask = {
    id: newMineId(),
    title: text,
    status: "next",
    updatedAt: now,
    agentName: "me",
  };
  const existing = applyDismissals(readFileTasks(minePath()));
  writeTasksFile(minePath(), [task, ...existing]);
  return readMineTasks();
}
