# Activity schema (`blob.activity/v1`)

Portable status file for Grok Bot hosts and clients. **This is the baseline.** Any bot, overlay, or dashboard on any host can write and read it. Customize later (extra fields, more statuses) without breaking readers: unknown fields are ignored.

Blob's activity panel is one consumer. It is not Blob-Builder-private.

## File

JSON, UTF-8. Write atomically if you can (write temp, then rename).

Look for, in this order (later files win on task **fields** by `id`; **array order** is first-seen, so a Blob reorder of userData sticks):

1. Electron `userData/activity.json` (Blob-local seed)
2. `<cwd>/.blob-activity.json` (optional Blob convenience)
3. `<cwd>/activity.json` — **the published path** other writers should use

`cwd` is the process working directory of the reader (for Blob launched from a project, that is the project root).

## Document

```json
{
  "schema": "blob.activity/v1",
  "tasks": [
    {
      "id": "unique-stable-id",
      "title": "Human label for the work",
      "status": "running",
      "agentId": "<agent-uuid>",
      "agentName": "TheFirst",
      "updatedAt": "2026-09-03T11:30:00.000Z",
      "priority": 0
    }
  ]
}
```

A copy-paste fixture lives in [activity.example.json](activity.example.json).

| Field | Required | Notes |
|-------|----------|--------|
| `schema` | no | Writers should send `"blob.activity/v1"`. Readers should not reject a missing schema. |
| `tasks` | yes | Array. Empty array means "nothing in flight." **Order is priority** (index `0` = highest / top of the panel). |
| `jobs` | — | Deprecated alias for `tasks`. Readers may accept it so older writers keep working. |

## Task

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `id` | yes | string | Stable per task. Same id = same row; last write wins when files merge. |
| `title` | yes | string | Short human label. |
| `status` | yes | string | Baseline: `queued`, `running`, `waiting`, `next`, `done`, `failed`. Unknown values degrade to a muted label. |
| `updatedAt` | yes | string | ISO-8601 timestamp. |
| `agentId` | no | string | Host agent UUID when known. Blob uses this to join live `listAgents` busy state and to select the agent. |
| `agentName` | no | string | Display name. Used for the chip when `agentId` is missing, and as a fallback match against the live roster. |
| `note` | no | string | Recommended few-liner for what the task is doing. Shown in the Details popover. Not secrets or prompt text. |
| `description` | no | string | Alias for `note`. Blob copies it onto `note` when `note` is missing. |
| `priority` | no | number | Optional rank kept in sync with array index (`0` = highest). **Array order is the source of truth.** Readers that ignore this field still work. Blob sorts by array order, not by this number. |

Do not put secrets, tokens, or prompt text in this file.

## How Blob mixes pipeline + agents

1. Read the status file (pipeline: what work exists). Paint rows in **array order** (top = highest priority).
2. Poll host `POST /api/listAgents` while the panel is open (live: busy / composing / awaiting you / idle).
3. Paint **task rows** first. Each row shows status plus an **agent chip** (`agentName`, or the live roster name when `agentId` / name matches). The chip's busy color comes from `listAgents`, not from the file.
4. A compact **agent roster** sits under the pipeline so you can still see who is idle.

This is not live executor todos. If nobody writes the file, Blob seeds two example tasks in `userData` so the panel is not empty.

**Statuses:** `running` (in flight), `waiting` (blocked on a decision; Blob labels it `waiting`), `queued`, `next` (up next / planned), `done`, `failed`. Unknown statuses still parse and show as a muted label.

**Freshness:** Blob re-reads these files while the activity panel is open (and on a modest interval when it is closed). Panel Sync and header Sync (`⌘⇧R`) force an immediate re-read (chron shows `syncing…`). It diffs by `id` in memory and shows last-checked plus `2 updated · 1 new` / `no change`. `running` / `queued` / `waiting` older than ~2 hours get a `stale` label. If the only rows are the demo seed (`demo-…` ids) and they are older than a few hours, the panel shows `demo seed — waiting for host activity.json`. Demo seed rows are dropped when a host file has any real task.

**Details:** right-click a row for Details. The popover shows `note` (or `description`). If missing: `No description yet.` Local only — Blob does not call an agent for this.

**Clear:** right-click Clear (and a checkmark on `done` rows) hides the row in Blob. Dismissed ids are stored in Electron `userData/dismissed-activity.json`. Blob does **not** rewrite the host `activity.json`. If the same `id` later returns with a newer `updatedAt` and status `running` / `queued` / `next` / `waiting`, it is shown again.

## Order / priority

`tasks` array order is pipeline priority: index `0` is highest (top of the panel). Blob Builder and other readers should pick work from the top.

Blob's activity panel drag-and-drop (grab handle) plus right-click Move up / Move down rewrites Electron `userData/activity.json` via `setActivityTasks`. It stamps `priority` to match the new index. It does not rewrite a host `<cwd>/activity.json`. Chron may briefly show `reordered`. No LLM call.

When several files merge, later files win on task **fields** by `id`. **Order** comes from the first file that listed the id (userData, then `.blob-activity.json`, then cwd), so a Blob reorder sticks even if a host file later rewrites the same rows. New ids from later files are appended.

## Writer rules

- Rewrite the whole `tasks` array (or merge by `id` yourself). Array order is priority (top = highest). Blob's `setActivityTasks` IPC writes `userData/activity.json` and stamps `priority` to the index.
- Prefer `agentId` when you have it; always send `agentName` so chips work before the roster is up.
- Drop or mark `done`/`failed` when work ends. Readers may still show completed rows.
- Extra fields are fine (`note`, `url`, `progress`, `priority`). Baseline readers ignore unknown ones; `priority` is optional.

## Customizing

Add fields, more statuses, or another file. Keep `id`, `title`, `status`, `updatedAt` so baseline readers still work. Extra statuses beyond `queued` / `running` / `waiting` / `next` / `done` / `failed` degrade to a muted label, not crash.

A later schema id (`blob.activity/v2`) is allowed; v1 readers should keep parsing `tasks` if the shape is the same.

## Personal Mine feed (`blob.mine/v1`)

Blob's activity panel also has a **Mine** tab for Nuno's personal todos. That feed is **not** the published host schema.

- File: Electron `userData/mine-tasks.json` (`blob.mine/v1`)
- Soft dismiss: `userData/dismissed-mine.json` (same shape as `dismissed-activity.json`)
- Same task row shape as `ActivityTask` (`id`, `title`, `status`, `updatedAt`, optional `note` / `priority`). Rows use `agentName: "me"` and no `agentId`.
- Agent writers must not write this file; it stays local to Blob so host `activity.json` cannot overwrite personal todos.
