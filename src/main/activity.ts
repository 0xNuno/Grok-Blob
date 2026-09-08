import { app } from "electron";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dropDemoDuplicates, IN_FLIGHT_STATUSES } from "../shared/activity-chron";
import { ACTIVITY_SCHEMA, type ActivityFeed, type ActivityTask, type ActivityTaskStatus } from "../shared/types";

const KNOWN = new Set<string>(["queued", "running", "waiting", "next", "done", "failed"]);

function userDataPath(): string {
  return join(app.getPath("userData"), "activity.json");
}

function projectDotPath(): string {
  return join(process.cwd(), ".blob-activity.json");
}

function cwdPortablePath(): string {
  return join(process.cwd(), "activity.json");
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTask(value: unknown): ActivityTask | null {
  if (value == null || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.id !== "string" || rec.id.trim().length === 0) return null;
  if (typeof rec.title !== "string" || rec.title.trim().length === 0) return null;
  if (typeof rec.status !== "string" || rec.status.trim().length === 0) return null;
  if (typeof rec.updatedAt !== "string" || rec.updatedAt.trim().length === 0) return null;
  const rawStatus = rec.status.trim();
  const lower = rawStatus.toLowerCase();
  const status: ActivityTask["status"] = KNOWN.has(lower) ? (lower as ActivityTaskStatus) : rawStatus;
  const task: ActivityTask = {
    id: rec.id.trim(),
    title: rec.title.trim(),
    status,
    updatedAt: rec.updatedAt,
  };
  const agentId = asOptionalString(rec.agentId);
  const agentName = asOptionalString(rec.agentName);
  const note = asOptionalString(rec.note) ?? asOptionalString(rec.description);
  if (agentId) task.agentId = agentId;
  if (agentName) task.agentName = agentName;
  if (note) task.note = note;
  if (typeof rec.priority === "number" && Number.isFinite(rec.priority)) {
    task.priority = rec.priority;
  }
  return task;
}

export function parseTasks(raw: unknown): ActivityTask[] {
  const rec = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(raw)
    ? raw
    : rec && Array.isArray(rec.tasks)
      ? rec.tasks
      : rec && Array.isArray(rec.jobs)
        ? rec.jobs
        : [];
  const tasks: ActivityTask[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const task = parseTask(item);
    if (!task || seen.has(task.id)) continue;
    seen.add(task.id);
    tasks.push(task);
  }
  return tasks;
}

function demoTasks(): ActivityTask[] {
  // Ids are recognized by the in-memory chron as demo seed, not live host work.
  const now = new Date().toISOString();
  return [
    {
      id: "demo-activity-panel",
      title: "Activity panel v1",
      status: "running",
      agentName: "Blob Builder",
      updatedAt: now,
    },
    {
      id: "demo-queued",
      title: "Example queued task",
      status: "queued",
      agentName: "TheFirst",
      updatedAt: now,
    },
  ];
}

function readFileTasks(path: string): ActivityTask[] | null {
  if (!existsSync(path)) return null;
  try {
    return parseTasks(JSON.parse(readFileSync(path, "utf8")) as unknown);
  } catch {
    return [];
  }
}

function stampPriorities(tasks: ActivityTask[]): ActivityTask[] {
  return tasks.map((task, index) => ({ ...task, priority: index }));
}

function documentFor(tasks: ActivityTask[]): string {
  return JSON.stringify({ schema: ACTIVITY_SCHEMA, tasks: stampPriorities(tasks) }, null, 2) + "\n";
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


function dismissedPath(): string {
  return join(app.getPath("userData"), "dismissed-activity.json");
}

type DismissedMap = Record<string, { updatedAt: string; dismissedAt: string }>;

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

export function readActivity(): ActivityFeed {
  const fromUser = readFileTasks(userDataPath());
  const fromDot = readFileTasks(projectDotPath());
  const fromCwd = readFileTasks(cwdPortablePath());
  if (fromUser == null && fromDot == null && fromCwd == null) {
    const seeded = demoTasks();
    try {
      writeTasksFile(userDataPath(), seeded);
    } catch {
      // Renderer can still show the in-memory seed.
    }
    return { schema: ACTIVITY_SCHEMA, tasks: seeded, source: "userData" };
  }
  const map = new Map<string, ActivityTask>();
  for (const task of fromUser ?? []) map.set(task.id, task);
  for (const task of fromDot ?? []) map.set(task.id, task);
  for (const task of fromCwd ?? []) map.set(task.id, task);
  // Array order is priority (first-seen wins: userData, then project, then cwd).
  // Later files overwrite task fields by id but do not reshuffle earlier rows.
  const tasks = applyDismissals(dropDemoDuplicates([...map.values()]));
  const present = [fromUser, fromDot, fromCwd].filter((item) => item != null).length;
  let source: ActivityFeed["source"] = "userData";
  if (present > 1) source = "merged";
  else if (fromCwd != null) source = "cwd";
  else if (fromDot != null) source = "project";
  return { schema: ACTIVITY_SCHEMA, tasks, source };
}

export function setActivityTasks(input: unknown): ActivityFeed {
  const tasks = stampPriorities(parseTasks(input));
  writeTasksFile(userDataPath(), tasks);
  return readActivity();
}

export function dismissActivityTask(id: unknown): ActivityFeed {
  const want = String(id ?? "").trim();
  if (!want) return readActivity();
  const visible = readActivity().tasks.find((task) => task.id === want);
  const dismissed = readDismissed();
  dismissed[want] = {
    updatedAt: visible?.updatedAt ?? new Date().toISOString(),
    dismissedAt: new Date().toISOString(),
  };
  writeDismissed(dismissed);
  return readActivity();
}
