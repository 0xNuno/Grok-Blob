# Upgrading / what’s next

Shipped on this tree for v1 launch. These are the next product upgrades on the board — not a schedule, just what’s cooking.

## In progress / next

- **Fix: reply breaking in UI** — reply-to / quote rendering (or composer reply) can break in the sheet; investigate and fix.
- **Customizable color palettes** — let you pick or tune Blob chrome / accent colors beyond the built-in brown sheet.
- **Pipeline: build-cutoff line** — place a marker in the task list; everything above the line is the build batch.
- **Pipeline: change bot assigned to a task** — reassign `agentId` / `agentName` from the roster (chip already shows who it is).

## Recently shipped (also on this tree)

- Right-click **Start building** on pipeline tasks (sends a build prompt to the task’s agent)
- No auto-switch on incoming messages (unread badges instead)
- Transcript poll every ~2s while the sheet is open (less Sync-needed lag)
- Drag-resize seam between chat and pipeline; Bots | Mine tabs
- `.env.example` template; `.env` load only from the app/project dirs

## Not in the default installer

VPN/mesh is still bring-your-own ([connecting.md](connecting.md)). Gateway URL + token stay in settings / Keychain.
