import type { ActivityTask } from "./types";

/** running/queued/waiting with updatedAt older than this is painted "stale". */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
/** Demo seed alone older than this is no longer treated as a live pipeline. */
export const DEMO_SEED_AFTER_MS = 3 * 60 * 60 * 1000;

const DEMO_IDS = new Set(["demo-activity-panel", "demo-queued"]);

export type ActivityChron = {
  newCount: number;
  updatedCount: number;
  removedCount: number;
  /** Rows to flash: new tasks and status changes. */
  changedIds: string[];
  summary: string;
};

export function isDemoTask(task: ActivityTask): boolean {
  return task.id.startsWith("demo-") || DEMO_IDS.has(task.id);
}

export function isAncientDemoSeed(tasks: ActivityTask[], now = Date.now()): boolean {
  if (tasks.length === 0) return false;
  if (!tasks.every(isDemoTask)) return false;
  let newest = 0;
  for (const task of tasks) {
    const t = Date.parse(task.updatedAt);
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (newest === 0) return true;
  return now - newest >= DEMO_SEED_AFTER_MS;
}

const KNOWN_STATUS = new Set<string>(["queued", "running", "waiting", "next", "done", "failed"]);
export const IN_FLIGHT_STATUSES = new Set<string>(["running", "queued", "waiting", "next"]);

export function activityStatusClass(status: string): string {
  return KNOWN_STATUS.has(status) ? status : "unknown";
}

export function activityStatusLabel(status: string): string {
  const trimmed = status.trim();
  if (!trimmed) return "unknown";
  if (trimmed === "waiting") return "waiting";
  return trimmed;
}

/** Drop leftover demo-seed rows when a host file has real tasks. */
export function dropDemoDuplicates(tasks: ActivityTask[]): ActivityTask[] {
  if (!tasks.some((task) => !isDemoTask(task))) return tasks;
  return tasks.filter((task) => !isDemoTask(task));
}

export function isStaleTask(task: ActivityTask, now = Date.now()): boolean {
  if (task.status !== "running" && task.status !== "queued" && task.status !== "waiting") return false;
  const t = Date.parse(task.updatedAt);
  if (!Number.isFinite(t)) return true;
  return now - t >= STALE_AFTER_MS;
}

function fingerprint(task: ActivityTask): string {
  return `${task.status}\0${task.updatedAt}\0${task.title}\0${task.agentId ?? ""}\0${task.agentName ?? ""}\0${task.note ?? ""}\0${task.priority ?? ""}`;
}

function formatSummary(newCount: number, updatedCount: number, removedCount: number): string {
  if (newCount === 0 && updatedCount === 0 && removedCount === 0) return "no change";
  const parts: string[] = [];
  if (updatedCount > 0) parts.push(`${updatedCount} updated`);
  if (newCount > 0) parts.push(`${newCount} new`);
  if (removedCount > 0) parts.push(`${removedCount} gone`);
  return parts.join(" · ");
}

export function emptyChron(): ActivityChron {
  return { newCount: 0, updatedCount: 0, removedCount: 0, changedIds: [], summary: "no change" };
}

export function diffTasks(prev: ActivityTask[] | null, next: ActivityTask[]): ActivityChron {
  if (prev == null) return emptyChron();
  const prevMap = new Map(prev.map((task) => [task.id, task]));
  const nextIds = new Set(next.map((task) => task.id));
  let newCount = 0;
  let updatedCount = 0;
  let removedCount = 0;
  const changedIds: string[] = [];
  for (const task of next) {
    const before = prevMap.get(task.id);
    if (!before) {
      newCount += 1;
      changedIds.push(task.id);
      continue;
    }
    if (fingerprint(before) !== fingerprint(task)) {
      updatedCount += 1;
      if (before.status !== task.status) changedIds.push(task.id);
    }
  }
  for (const task of prev) {
    if (!nextIds.has(task.id)) removedCount += 1;
  }
  return {
    newCount,
    updatedCount,
    removedCount,
    changedIds,
    summary: formatSummary(newCount, updatedCount, removedCount),
  };
}

export function formatCheckedAt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatChronLine(checkedAt: number, chron: ActivityChron): string {
  const time = formatCheckedAt(checkedAt);
  if (!time) return "checking…";
  return `${time} · ${chron.summary}`;
}
