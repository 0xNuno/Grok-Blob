import type { ActivityTask, AgentRow, AttachmentChip, ChatMessage, ChatWidget, SheetState } from "../shared/types";
import { DEFAULT_GATEWAY_URL } from "../shared/types";
import {
  activityStatusClass,
  activityStatusLabel,
  diffTasks,
  emptyChron,
  formatChronLine,
  isAncientDemoSeed,
  isStaleTask,
  type ActivityChron,
} from "../shared/activity-chron";
import { agentTint, applyAgentTint, BRAND_TINT, type AgentTint } from "../shared/agentColor";

type BlobApi = {
  bootstrap: () => Promise<SheetState>;
  saveSettings: (input: { gatewayUrl: string; token?: string }) => Promise<SheetState>;
  selectAgent: (id: string) => Promise<SheetState>;
  sendPrompt: (prompt: string, replyToId?: string) => Promise<SheetState>;
  hide: () => Promise<SheetState>;
  reactToMessage: (input: { entryId: string; emoji: string }) => Promise<SheetState>;
  respondToWidget: (input: { entryId: string; value: string }) => Promise<SheetState>;
  dismissWidget: (entryId: string) => Promise<SheetState>;
  resolveGate: (input: {
    entryId: string;
    requestId: string;
    gate: "auto-review" | "local-tool";
    approved: boolean;
  }) => Promise<SheetState>;
  openSettings: () => Promise<SheetState>;
  sync: () => Promise<SheetState>;
  refreshRoster: () => Promise<SheetState>;
  getActivity: () => Promise<{ tasks: ActivityTask[]; source: string }>;
  setActivityTasks: (tasks: ActivityTask[]) => Promise<{ tasks: ActivityTask[]; source: string }>;
  dismissActivityTask: (id: string) => Promise<{ tasks: ActivityTask[]; source: string }>;
  getMineTasks: () => Promise<{ tasks: ActivityTask[]; source: string }>;
  setMineTasks: (tasks: ActivityTask[]) => Promise<{ tasks: ActivityTask[]; source: string }>;
  dismissMineTask: (id: string) => Promise<{ tasks: ActivityTask[]; source: string }>;
  addMineTask: (title: string) => Promise<{ tasks: ActivityTask[]; source: string }>;
  setPanelOpen: (open: boolean) => Promise<SheetState>;
  setPanelWidth: (width: number) => Promise<SheetState>;
  capture: (mode: "region" | "screen") => Promise<SheetState>;
  attachClipboard: () => Promise<SheetState>;
  removeAttachment: (id: string) => Promise<SheetState>;
  openScreenRecording: () => Promise<SheetState>;
  chromeDrag: (input: { phase: "start" | "move" | "end"; x: number; y: number }) => void;
  onFocusInput: (handler: () => void) => () => void;
  onOpenFind: (handler: () => void) => () => void;
  onOpenPicker: (handler: () => void) => () => void;
  onCycleAgent: (handler: (delta: number) => void) => () => void;
  onJumpAgent: (handler: (n: number) => void) => () => void;
  onState: (handler: (state: SheetState) => void) => () => void;
};

declare global {
  interface Window {
    blob: BlobApi;
  }
}

const main = document.getElementById("main") as HTMLElement;
const agentMark = document.getElementById("agent-mark") as HTMLElement;
const agentLine = document.getElementById("agent-line") as HTMLElement;
const banner = document.getElementById("banner") as HTMLParagraphElement;
const composer = document.getElementById("composer") as HTMLElement;
const promptEl = document.getElementById("prompt") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send") as HTMLButtonElement;
const captureBtn = document.getElementById("capture") as HTMLButtonElement;
const attachBar = document.getElementById("attach-bar") as HTMLElement;
const replyBar = document.getElementById("reply-bar") as HTMLElement;
const replyBarQuote = document.getElementById("reply-bar-quote") as HTMLElement;
const replyBarClear = document.getElementById("reply-bar-clear") as HTMLButtonElement;
const gear = document.getElementById("gear") as HTMLButtonElement;
const syncBtn = document.getElementById("sync") as HTMLButtonElement;
const chromeEl = document.getElementById("chrome") as HTMLElement;
const activityToggle = document.getElementById("activity-toggle") as HTMLButtonElement;
const activityEl = document.getElementById("activity") as HTMLElement;
const activitySyncBtn = document.getElementById("activity-sync") as HTMLButtonElement;
const panelSplit = document.getElementById("panel-split") as HTMLElement;
const agentRoster = document.getElementById("agent-roster") as HTMLElement;
const taskList = document.getElementById("task-list") as HTMLElement;
const activityChron = document.getElementById("activity-chron") as HTMLElement;
const activitySeed = document.getElementById("activity-seed") as HTMLElement;
const activityNote = document.getElementById("activity-note") as HTMLElement;
const pipelineTabBots = document.getElementById("pipeline-tab-bots") as HTMLButtonElement;
const pipelineTabMine = document.getElementById("pipeline-tab-mine") as HTMLButtonElement;
const mineCompose = document.getElementById("mine-compose") as HTMLElement;
const mineInput = document.getElementById("mine-input") as HTMLInputElement;
const mineAddBtn = document.getElementById("mine-add") as HTMLButtonElement;
const taskMenu = document.getElementById("task-menu") as HTMLElement;
const taskDetail = document.getElementById("task-detail") as HTMLElement;
const taskDetailTitle = document.getElementById("task-detail-title") as HTMLElement;
const taskDetailMeta = document.getElementById("task-detail-meta") as HTMLElement;
const taskDetailBody = document.getElementById("task-detail-body") as HTMLElement;
const taskDetailExtra = document.getElementById("task-detail-extra") as HTMLElement;
const taskDetailExpand = document.getElementById("task-detail-expand") as HTMLButtonElement;
const findBar = document.getElementById("find-bar") as HTMLElement;
const findInput = document.getElementById("find-input") as HTMLInputElement;
const findCount = document.getElementById("find-count") as HTMLElement;
const findPrevBtn = document.getElementById("find-prev") as HTMLButtonElement;
const findNextBtn = document.getElementById("find-next") as HTMLButtonElement;
const findCloseBtn = document.getElementById("find-close") as HTMLButtonElement;
const pickerEl = document.getElementById("agent-picker") as HTMLElement;
const pickerInput = document.getElementById("agent-picker-input") as HTMLInputElement;
const pickerList = document.getElementById("agent-picker-list") as HTMLElement;
const msgMenu = document.getElementById("msg-menu") as HTMLElement;

let sending = false;
let syncingUi = false;
let activitySyncing = false;
let activityReordering = false;
let current: SheetState | null = null;
let panelOpen = false;
let panelTimer: number | null = null;
let lastTasks: ActivityTask[] = [];
type PipelineTab = "bots" | "mine";
const PIPELINE_TAB_KEY = "blob.pipelineTab";
const PANEL_WIDTH_KEY = "blob.panelWidth";
const PANEL_WIDTH_DEFAULT = 252;
const PANEL_WIDTH_MIN = 220;
const PANEL_WIDTH_MAX = 520;
/** Above this, use the roomy grid layout (tasks + agents lanes). */
const PANEL_WIDE_AT = 320;

function clampPanelWidth(n: number): number {
  return Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, Math.round(n)));
}

function loadPanelWidth(): number {
  try {
    const raw = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(raw) ? clampPanelWidth(raw) : PANEL_WIDTH_DEFAULT;
  } catch {
    return PANEL_WIDTH_DEFAULT;
  }
}

let panelWidth = loadPanelWidth();
let panelResizing = false;
let panelResizeStartX = 0;
let panelResizeStartW = PANEL_WIDTH_DEFAULT;
function loadPipelineTab(): PipelineTab {
  try {
    const raw = localStorage.getItem(PIPELINE_TAB_KEY);
    return raw === "mine" ? "mine" : "bots";
  } catch {
    return "bots";
  }
}
let pipelineTab: PipelineTab = loadPipelineTab();
let chronPrev: ActivityTask[] | null = null;
let lastChron: ActivityChron = emptyChron();
let lastCheckedAt = 0;
let flashIds = new Set<string>();
let flashUntil = 0;
let menuTask: ActivityTask | null = null;
let detailTaskId: string | null = null;
let detailExpanded = false;
const OPEN_POLL_MS = 2500;
const CLOSED_POLL_MS = 15000;
let holdingSetup = false;
let viewingSettings = false;
let setupHoldTimer: number | null = null;
let setupAttempt = false;
let replyTarget: ChatMessage | null = null;
let findOpen = false;
let findHits: HTMLElement[] = [];
let findIndex = 0;
let pickerOpen = false;
let pickerHits: AgentRow[] = [];
let pickerIndex = 0;
let menuMsg: ChatMessage | null = null;
const FIND_HAYSTACK = ".msg .body, .msg .reply-quote, .widget-prompt, .widget-help, .widget-fields dd";
const REACT_FACES = ["👍", "👎", "❤️", "😂", "🎉", "👀"];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function leaveSettings(): void {
  if (!current?.configured) return;
  viewingSettings = false;
  holdingSetup = false;
  setupAttempt = false;
  if (setupHoldTimer !== null) {
    window.clearTimeout(setupHoldTimer);
    setupHoldTimer = null;
  }
  apply(current);
}

function settingsForm(): HTMLFormElement | null {
  return main.querySelector("form.settings");
}

function setSetupStatus(text: string, kind: "ok" | "err" | "busy" | "warn" | ""): void {
  const el = document.getElementById("setup-status") as HTMLParagraphElement | null;
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.className = "setup-status";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = `setup-status ${kind}`;
}

function setConnectButton(label: string, disabled: boolean): void {
  const btn = document.getElementById("connect-btn") as HTMLButtonElement | null;
  if (!btn) return;
  btn.textContent = label;
  btn.disabled = disabled;
}

function patchTokenStatus(tokenSet: boolean): void {
  const status = document.getElementById("token-status");
  const input = document.getElementById("token") as HTMLInputElement | null;
  if (status) status.hidden = !tokenSet;
  if (input) input.placeholder = tokenSet ? "type to replace" : "paste the gateway token";
}

function updateBanner(next: SheetState): void {
  let text = "";
  let kind = "";
  if (next.error) {
    text = next.error;
    kind = "err";
  } else if (holdingSetup && next.status === "connected") {
    text = "connected";
    kind = "ok";
  } else if (next.warning) {
    text = next.warning;
    kind = "warn";
  } else if (next.status === "syncing") {
    text = "syncing…";
    kind = "busy";
  } else if (!next.configured && next.status === "connecting") {
    text = "connecting…";
    kind = "busy";
  } else if (next.hotkeyTaken) {
    text = "hotkey already taken";
    kind = "info";
  }
  banner.hidden = text.length === 0;
  banner.textContent = text;
  banner.className = kind ? `banner ${kind}` : "banner";
}

function apply(next: SheetState): void {
  current = next;
  const busySync = next.status === "syncing";
  syncingUi = busySync;
  syncBtn.classList.toggle("syncing", busySync);
  syncBtn.disabled = busySync;

  const stayOnSetup = !next.configured || holdingSetup || viewingSettings;
  const justConnected =
    setupAttempt && next.configured && !next.error && next.status === "connected";

  if (justConnected && !holdingSetup) {
    setupAttempt = false;
    holdingSetup = true;
    paintChrome(next);
    closeMsgMenu();
    composer.hidden = true;
    if (!settingsForm()) renderSettings(next);
    else patchSettings(next);
    updateBanner(next);
    setSetupStatus("connected", "ok");
    setConnectButton("connected", true);
    if (setupHoldTimer !== null) window.clearTimeout(setupHoldTimer);
    setupHoldTimer = window.setTimeout(() => {
      setupHoldTimer = null;
      holdingSetup = false;
      if (current) apply(current);
    }, 850);
    return;
  }

  paintChrome(next);

  if (stayOnSetup) {
    closeFind({ restoreFocus: false });
    closePicker({ restoreFocus: false });
    closeMsgMenu();
    composer.hidden = true;
    if (!settingsForm()) renderSettings(next);
    else patchSettings(next);
    updateBanner(next);
    return;
  }

  setupAttempt = false;
  updateBanner(next);
  composer.hidden = false;
  renderAgent(next);
  renderMessages(next);
  paintAttachBar(next.attachments ?? []);
  // Keep the working banner while the host is busy, but only lock the
  // composer during the brief local send IPC (`sending`). Users can type
  // and send follow-ups while the agent is still thinking.
  promptEl.disabled = sending;
  sendBtn.disabled = sending;
  captureBtn.disabled = sending;
  if (replyTarget && !next.messages.some((msg) => msg.id === replyTarget?.id)) {
    setReply(null);
  } else {
    paintReplyBar();
  }
  if (panelOpen) {
    renderRoster(next.agents, next.agentId);
    renderTasks(lastTasks, next.agents);
    paintChron();
  }
  if (pickerOpen) paintPicker({ keepIndex: true });
  syncMsgMenu();
}

function closeFind(opts?: { restoreFocus?: boolean }): void {
  if (!findOpen && findBar.hidden) return;
  findOpen = false;
  findBar.hidden = true;
  unwrapFindMarks(main);
  findHits = [];
  findIndex = 0;
  findCount.textContent = "";
  findCount.classList.remove("miss");
  if (opts?.restoreFocus !== false) promptEl.focus();
}

function openFind(): void {
  if (!current?.configured || holdingSetup) return;
  closePicker({ restoreFocus: false });
  findOpen = true;
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
  runFind(findInput.value, { keepIndex: true });
}

function closePicker(opts?: { restoreFocus?: boolean }): void {
  if (!pickerOpen && pickerEl.hidden) return;
  pickerOpen = false;
  pickerEl.hidden = true;
  pickerHits = [];
  pickerIndex = 0;
  pickerInput.value = "";
  pickerList.replaceChildren();
  const switcher = agentLine.querySelector(".agent-switch");
  if (switcher) switcher.setAttribute("aria-expanded", "false");
  if (opts?.restoreFocus !== false) promptEl.focus();
}

function openPicker(): void {
  if (!current?.configured || holdingSetup) return;
  closeFind({ restoreFocus: false });
  pickerOpen = true;
  pickerEl.hidden = false;
  const switcher = agentLine.querySelector(".agent-switch");
  if (switcher) switcher.setAttribute("aria-expanded", "true");
  pickerInput.value = "";
  paintPicker({ selectCurrent: true });
  pickerInput.focus();
  pickerInput.select();
}

function agentMatches(agent: AgentRow, q: string): boolean {
  if (!q) return true;
  const hay = `${agent.name} ${agent.isGroup ? "group" : ""}`.toLowerCase();
  return hay.includes(q);
}

function paintPicker(opts?: { selectCurrent?: boolean; keepIndex?: boolean }): void {
  if (!current) return;
  const q = pickerInput.value.trim().toLowerCase();
  pickerHits = current.agents.filter((agent) => agentMatches(agent, q));
  if (opts?.selectCurrent) {
    const idx = pickerHits.findIndex((agent) => agent.id === current?.agentId);
    pickerIndex = idx >= 0 ? idx : 0;
  } else if (opts?.keepIndex) {
    pickerIndex = pickerHits.length === 0 ? 0 : Math.min(pickerIndex, pickerHits.length - 1);
  } else {
    pickerIndex = 0;
  }
  pickerList.replaceChildren();
  if (pickerHits.length === 0) {
    const empty = document.createElement("p");
    empty.className = "agent-picker-empty";
    empty.textContent = current.agents.length === 0 ? "no agents" : "no match";
    pickerList.append(empty);
    return;
  }
  for (let i = 0; i < pickerHits.length; i++) {
    const agent = pickerHits[i];
    const rosterIdx = current.agents.indexOf(agent);
    const status = agentStatus(agent);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "agent-picker-item" +
      (i === pickerIndex ? " active" : "") +
      (agent.id === current.agentId ? " selected" : "");
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", i === pickerIndex ? "true" : "false");
    btn.title = agent.isGroup ? `${agent.name} (group) · ${status.label}` : `${agent.name} · ${status.label}`;
    applyAgentTint(btn, agentTint(agent));
    const dot = document.createElement("span");
    dot.className = `status-dot ${status.key}`;
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = agent.isGroup ? `${agent.name} (group)` : agent.name;
    const meta = document.createElement("span");
    meta.className = "picker-meta";
    meta.textContent = rosterIdx >= 0 && rosterIdx < 9 ? String(rosterIdx + 1) : status.label;
    btn.append(dot, name, meta);
    const index = i;
    btn.addEventListener("click", () => {
      void pickAgent(agent.id);
    });
    btn.addEventListener("mouseenter", () => {
      pickerIndex = index;
      markPickerActive();
    });
    pickerList.append(btn);
  }
  markPickerActive();
}

function markPickerActive(): void {
  const items = pickerList.querySelectorAll(".agent-picker-item");
  items.forEach((el, i) => {
    el.classList.toggle("active", i === pickerIndex);
    el.setAttribute("aria-selected", i === pickerIndex ? "true" : "false");
  });
  const active = items[pickerIndex];
  if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
}

function pickerStep(delta: number): void {
  if (!pickerOpen || pickerHits.length === 0) return;
  pickerIndex = (pickerIndex + delta + pickerHits.length) % pickerHits.length;
  markPickerActive();
}

async function pickAgent(id: string): Promise<void> {
  closePicker({ restoreFocus: false });
  if (current?.agentId === id) {
    promptEl.focus();
    return;
  }
  const next = await window.blob.selectAgent(id);
  apply(next);
  promptEl.focus();
}

function cycleAgent(delta: number): void {
  if (!current?.configured || holdingSetup) return;
  const agents = current.agents;
  if (agents.length === 0) return;
  const idx = agents.findIndex((agent) => agent.id === current?.agentId);
  const from = idx < 0 ? 0 : idx;
  const next = agents[(from + delta % agents.length + agents.length) % agents.length];
  if (!next) return;
  void pickAgent(next.id);
}

function jumpAgent(n: number): void {
  if (!current?.configured || holdingSetup) return;
  const agent = current.agents[n - 1];
  if (!agent) return;
  void pickAgent(agent.id);
}

/** Trackpad two-finger pans arrive as wheel events with deltaX (not touch). */
const SWIPE_AXIS_RATIO = 1.6;
const SWIPE_THRESHOLD = 90;
const SWIPE_COOLDOWN_MS = 420;
const SWIPE_ANIM_MS = 200;
let swipeAccumX = 0;
let swipeCoolUntil = 0;
let swipeAnimTimer: number | null = null;

function overlaysBlockSwipe(): boolean {
  return findOpen || pickerOpen || !msgMenu.hidden;
}

function playSwipeEffect(delta: number, tint?: AgentTint): void {
  const cls = delta > 0 ? "swipe-next" : "swipe-prev";
  if (swipeAnimTimer !== null) {
    window.clearTimeout(swipeAnimTimer);
    swipeAnimTimer = null;
  }
  if (tint) chromeEl.style.setProperty("--swipe-rgb", tint.rgb);
  else chromeEl.style.removeProperty("--swipe-rgb");
  chromeEl.classList.remove("swipe-next", "swipe-prev");
  // Force reflow so re-adding the class restarts the animation mid-flight.
  void chromeEl.offsetWidth;
  chromeEl.classList.add(cls);
  swipeAnimTimer = window.setTimeout(() => {
    chromeEl.classList.remove(cls);
    swipeAnimTimer = null;
  }, SWIPE_ANIM_MS);
}

/** Horizontal two-finger pan anywhere on the chrome cycles agents; transcript stays free. */
function onHeaderWheel(evt: WheelEvent): void {
  if (overlaysBlockSwipe()) {
    swipeAccumX = 0;
    return;
  }
  if (!current?.configured || holdingSetup) return;
  if ((current.agents?.length ?? 0) < 2) return;

  const absX = Math.abs(evt.deltaX);
  const absY = Math.abs(evt.deltaY);
  if (absX < 1 || absX < absY * SWIPE_AXIS_RATIO) {
    // Vertical scroll / jitter / weak diagonal — drop partial accumulate.
    swipeAccumX = 0;
    return;
  }

  // Consume the pan so it does not leak; clicks are a different pointer path.
  evt.preventDefault();

  const now = performance.now();
  if (now < swipeCoolUntil) return;

  // Natural Mac trackpad: fingers right → deltaX < 0 → next agent.
  swipeAccumX += evt.deltaX;
  if (Math.abs(swipeAccumX) < SWIPE_THRESHOLD) return;

  const fingersRight = swipeAccumX < 0;
  const delta = fingersRight ? 1 : -1;
  swipeAccumX = 0;
  swipeCoolUntil = now + SWIPE_COOLDOWN_MS;
  const agents = current.agents;
  const selectedId = current.agentId;
  const idx = agents.findIndex((agent) => agent.id === selectedId);
  const from = idx < 0 ? 0 : idx;
  const incoming = agents[(from + (delta % agents.length) + agents.length) % agents.length];
  playSwipeEffect(delta, incoming ? agentTint(incoming) : undefined);
  cycleAgent(delta);
}

function unwrapFindMarks(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll("mark.find-hit"))) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as HTMLElement).normalize();
  }
}

function runFind(raw: string, opts?: { keepIndex?: boolean }): void {
  unwrapFindMarks(main);
  findHits = [];
  const needle = raw.trim();
  if (needle.length === 0) {
    findCount.textContent = "";
    findCount.classList.remove("miss");
    findIndex = 0;
    return;
  }
  const q = needle.toLowerCase();
  for (const el of Array.from(main.querySelectorAll<HTMLElement>(FIND_HAYSTACK))) {
    highlightIn(el, q, needle.length);
  }
  if (findHits.length === 0) {
    findCount.textContent = "0";
    findCount.classList.add("miss");
    findIndex = 0;
    return;
  }
  findCount.classList.remove("miss");
  if (opts?.keepIndex) findIndex = Math.min(findIndex, findHits.length - 1);
  else findIndex = 0;
  paintCurrentHit();
}

function highlightIn(el: HTMLElement, qLower: string, qLen: number): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    texts.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of texts) {
    const value = textNode.data;
    const lower = value.toLowerCase();
    let from = 0;
    let idx = lower.indexOf(qLower, from);
    if (idx === -1) continue;
    const frag = document.createDocumentFragment();
    while (idx !== -1) {
      if (idx > from) frag.append(document.createTextNode(value.slice(from, idx)));
      const mark = document.createElement("mark");
      mark.className = "find-hit";
      mark.textContent = value.slice(idx, idx + qLen);
      findHits.push(mark);
      frag.append(mark);
      from = idx + qLen;
      idx = lower.indexOf(qLower, from);
    }
    if (from < value.length) frag.append(document.createTextNode(value.slice(from)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

function paintCurrentHit(): void {
  for (let i = 0; i < findHits.length; i++) {
    findHits[i].classList.toggle("current", i === findIndex);
  }
  findHits[findIndex]?.scrollIntoView({ block: "center", inline: "nearest" });
  findCount.textContent = `${findIndex + 1}/${findHits.length}`;
}

function findStep(delta: number): void {
  if (!findOpen) return;
  if (findHits.length === 0) {
    runFind(findInput.value);
    return;
  }
  findIndex = (findIndex + delta + findHits.length) % findHits.length;
  paintCurrentHit();
}

function paintChrome(next: SheetState): void {
  const onSetup = !next.configured || holdingSetup;
  const agent = next.agents.find((row) => row.id === next.agentId) ?? null;
  const tint = onSetup || !agent ? BRAND_TINT : agentTint(agent);
  applyAgentTint(document.documentElement, tint);
  const busy =
    !onSetup && (next.busy || Boolean(agent?.isRunning) || Boolean(agent?.isComposingMessage));
  agentMark.classList.toggle("busy", busy);
}

function renderAgent(next: SheetState): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "agent-switch";
  btn.setAttribute("aria-label", "Agent");
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", pickerOpen ? "true" : "false");
  const name = document.createElement("span");
  name.className = "agent-switch-name";
  if (next.agents.length === 0) {
    name.textContent = "no agents";
    btn.disabled = true;
    btn.append(name);
  } else {
    const currentAgent = next.agents.find((agent) => agent.id === next.agentId);
    const label = currentAgent?.name ?? "select agent";
    name.textContent = currentAgent?.isGroup ? `${label} (group)` : label;
    btn.title = "switch agent · ⌘K";
    btn.addEventListener("click", () => {
      if (pickerOpen) closePicker();
      else openPicker();
    });
    const chevron = document.createElement("span");
    chevron.className = "agent-switch-chevron";
    chevron.setAttribute("aria-hidden", "true");
    btn.append(name, chevron);
  }
  agentLine.replaceChildren(btn);
}

function renderMessages(next: SheetState): void {
  const frag = document.createDocumentFragment();
  if (next.messages.length === 0 && !next.busy) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "quiet for now. write below.";
    frag.append(empty);
  }
  for (const msg of next.messages) frag.append(messageNode(msg));
  if (next.busy) frag.append(workingNode(next.status));
  main.replaceChildren(frag);
  if (findOpen) {
    runFind(findInput.value, { keepIndex: true });
  } else if (chromeDragging) {
    // Keep the user's place while the chrome drag moves the window.
    main.scrollTop = lockedMainScrollTop ?? main.scrollTop;
  } else {
    main.scrollTop = main.scrollHeight;
  }
}

function setReply(msg: ChatMessage | null): void {
  replyTarget = msg;
  paintReplyBar();
  if (msg) promptEl.focus();
}

function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function paintAttachBar(chips: AttachmentChip[]): void {
  if (chips.length === 0) {
    attachBar.hidden = true;
    attachBar.replaceChildren();
    return;
  }
  attachBar.hidden = false;
  attachBar.replaceChildren();
  for (const chip of chips) {
    const el = document.createElement("div");
    el.className = "attach-chip";
    if (chip.thumb) {
      const img = document.createElement("img");
      img.src = chip.thumb;
      img.alt = "screenshot";
      el.append(img);
    }
    const meta = document.createElement("div");
    meta.className = "attach-meta";
    const label = document.createElement("span");
    label.className = "attach-label";
    label.textContent = "screenshot";
    const bytes = document.createElement("span");
    bytes.className = "attach-bytes";
    bytes.textContent = fmtBytes(chip.bytes);
    meta.append(label, bytes);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = "remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      void window.blob.removeAttachment(chip.id).then(apply);
    });
    el.append(meta, remove);
    attachBar.append(el);
  }
}

function paintReplyBar(): void {
  if (!replyTarget) {
    replyBar.hidden = true;
    replyBarQuote.textContent = "";
    return;
  }
  replyBar.hidden = false;
  const who = replyTarget.role === "user" ? "you" : "agent";
  const quote = replyTarget.text || replyTarget.widget?.prompt || "";
  replyBarQuote.textContent = `${who}: ${clip(quote)}`;
}

function clip(text: string, max = 88): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function messageCopyText(msg: ChatMessage): string {
  return (msg.text || msg.widget?.prompt || "").trim();
}

function closeMsgMenu(): void {
  if (msgMenu.hidden && !menuMsg) return;
  msgMenu.hidden = true;
  menuMsg = null;
  msgMenu.replaceChildren();
}

function syncMsgMenu(): void {
  if (msgMenu.hidden || !menuMsg) return;
  const fresh = current?.messages.find((item) => item.id === menuMsg?.id);
  if (!fresh) {
    closeMsgMenu();
    return;
  }
  menuMsg = fresh;
  paintMsgMenu();
}

function openMsgMenu(msg: ChatMessage, x: number, y: number): void {
  closeTaskUi();
  menuMsg = msg;
  paintMsgMenu();
  msgMenu.hidden = false;
  const w = msgMenu.offsetWidth;
  const h = msgMenu.offsetHeight;
  const pad = 8;
  const left = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
  const top = Math.max(pad, Math.min(y, window.innerHeight - h - pad));
  msgMenu.style.left = `${left}px`;
  msgMenu.style.top = `${top}px`;
}

function copyMessageText(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  });
}

function paintMsgMenu(): void {
  const msg = menuMsg;
  if (!msg) return;
  msgMenu.replaceChildren();
  const reply = document.createElement("button");
  reply.type = "button";
  reply.className = "msg-menu-item";
  reply.setAttribute("role", "menuitem");
  reply.textContent = "reply";
  reply.addEventListener("click", () => {
    closeMsgMenu();
    setReply(msg);
  });
  const faces = document.createElement("div");
  faces.className = "msg-menu-react";
  faces.setAttribute("role", "group");
  faces.setAttribute("aria-label", "react");
  const mine = new Set((msg.reactions ?? []).filter((item) => item.mine).map((item) => item.emoji));
  for (const face of REACT_FACES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-menu-face" + (mine.has(face) ? " mine" : "");
    btn.setAttribute("role", "menuitem");
    btn.textContent = face;
    btn.title = `react ${face}`;
    btn.disabled = sending;
    btn.addEventListener("click", () => {
      closeMsgMenu();
      void window.blob.reactToMessage({ entryId: msg.id, emoji: face }).then(apply);
    });
    faces.append(btn);
  }
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "msg-menu-copy";
  copy.setAttribute("role", "menuitem");
  copy.setAttribute("aria-label", "Copy");
  copy.title = "Copy";
  copy.append(copyIcon());
  const text = messageCopyText(msg);
  copy.disabled = text.length === 0;
  copy.addEventListener("click", () => {
    closeMsgMenu();
    if (text) copyMessageText(text);
  });
  const row = document.createElement("div");
  row.className = "msg-menu-row";
  row.append(reply, copy);
  msgMenu.append(row, faces);
}

function copyIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  const back = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  back.setAttribute("x", "5");
  back.setAttribute("y", "1.5");
  back.setAttribute("width", "9.5");
  back.setAttribute("height", "9.5");
  back.setAttribute("rx", "1.5");
  const front = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  front.setAttribute("x", "1.5");
  front.setAttribute("y", "5");
  front.setAttribute("width", "9.5");
  front.setAttribute("height", "9.5");
  front.setAttribute("rx", "1.5");
  svg.append(back, front);
  return svg;
}

function messageNode(msg: ChatMessage): HTMLElement {
  const el = document.createElement("article");
  el.className = `msg ${msg.role}`;
  el.dataset.role = msg.role;
  el.dataset.id = msg.id;
  el.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    openMsgMenu(msg, evt.clientX, evt.clientY);
  });
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = msg.role === "user" ? "you" : "agent";
  el.append(who);
  if (msg.replyTo) {
    const quote = document.createElement("button");
    quote.type = "button";
    quote.className = "reply-quote";
    const label = msg.replyTo.role === "user" ? "you" : msg.replyTo.role === "assistant" ? "agent" : "earlier";
    quote.textContent = `${label}: ${msg.replyTo.text}`;
    quote.title = "jump to parent";
    quote.addEventListener("click", () => {
      const parent = main.querySelector(`[data-id="${cssEscape(msg.replyTo?.id ?? "")}"]`);
      if (parent instanceof HTMLElement) parent.scrollIntoView({ block: "center" });
    });
    el.append(quote);
  }
  const showText = msg.text && (!msg.widget || msg.text !== msg.widget.prompt);
  if (showText) {
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = msg.text;
    el.append(body);
  } else if (!msg.widget) {
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = msg.text;
    el.append(body);
  }
  if (msg.widget) el.append(widgetNode(msg));
  el.append(reactionRow(msg), actionRow(msg));
  return el;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/"/g, "\"");
}

function reactionRow(msg: ChatMessage): HTMLElement {
  const row = document.createElement("div");
  row.className = "reactions";
  const list = msg.reactions ?? [];
  if (list.length === 0) {
    row.hidden = true;
    return row;
  }
  for (const item of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "react-pill" + (item.mine ? " mine" : "");
    btn.textContent = item.count > 1 ? `${item.emoji} ${item.count}` : item.emoji;
    btn.title = "toggle reaction";
    btn.disabled = sending;
    btn.addEventListener("click", () => {
      void window.blob.reactToMessage({ entryId: msg.id, emoji: item.emoji }).then(apply);
    });
    row.append(btn);
  }
  return row;
}

function actionRow(msg: ChatMessage): HTMLElement {
  const row = document.createElement("div");
  row.className = "msg-actions";
  const reply = document.createElement("button");
  reply.type = "button";
  reply.textContent = "reply";
  reply.addEventListener("click", () => setReply(msg));
  const picker = document.createElement("div");
  picker.className = "react-picker";
  picker.setAttribute("aria-label", "react");
  for (const face of REACT_FACES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = face;
    btn.title = `react ${face}`;
    btn.disabled = sending;
    btn.addEventListener("click", () => {
      void window.blob.reactToMessage({ entryId: msg.id, emoji: face }).then(apply);
    });
    picker.append(btn);
  }
  row.append(reply, picker);
  return row;
}

function widgetNode(msg: ChatMessage): HTMLElement {
  const widget = msg.widget as ChatWidget;
  const wrap = document.createElement("div");
  wrap.className = "widget";
  const prompt = document.createElement("div");
  prompt.className = "widget-prompt";
  prompt.textContent = widget.prompt;
  wrap.append(prompt);
  if (widget.helpText) {
    const help = document.createElement("div");
    help.className = "widget-help";
    help.textContent = widget.helpText;
    wrap.append(help);
  }
  if (widget.fields && widget.fields.length > 0) {
    const dl = document.createElement("dl");
    dl.className = "widget-fields";
    for (const field of widget.fields) {
      const dt = document.createElement("dt");
      dt.textContent = field.label;
      const dd = document.createElement("dd");
      dd.textContent = field.value;
      dl.append(dt, dd);
    }
    wrap.append(dl);
  }

  // Prefer allowing widget interaction while the host is busy; only lock
  // during the local send in-flight flag.
  const busy = sending;
  if (widget.kind === "choice") {
    if (widget.options && widget.options.length > 0) {
      const opts = document.createElement("div");
      opts.className = "widget-options";
      for (const option of widget.options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "widget-opt" + (option.style && option.style !== "default" ? ` ${option.style}` : "");
        btn.textContent = option.label;
        if (option.description) btn.title = option.description;
        btn.disabled = busy || widget.pending === false;
        btn.addEventListener("click", () => {
          void window.blob.respondToWidget({ entryId: msg.id, value: option.value }).then(apply);
        });
        opts.append(btn);
      }
      wrap.append(opts);
    }
    if (widget.pending !== false && widget.allowCustom) {
      const custom = document.createElement("form");
      custom.className = "widget-custom";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "write your own…";
      const go = document.createElement("button");
      go.type = "submit";
      go.className = "widget-opt";
      go.textContent = "send";
      custom.append(input, go);
      custom.addEventListener("submit", (evt) => {
        evt.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        void window.blob.respondToWidget({ entryId: msg.id, value }).then(apply);
      });
      wrap.append(custom);
    }
    if (widget.pending !== false) {
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "widget-opt";
      dismiss.textContent = "dismiss";
      dismiss.disabled = busy;
      dismiss.addEventListener("click", () => {
        void window.blob.dismissWidget(msg.id).then(apply);
      });
      wrap.append(dismiss);
    }
  }

  if (widget.kind === "approval" && widget.pending !== false && widget.requestId && widget.gate) {
    const opts = document.createElement("div");
    opts.className = "widget-options";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "widget-opt primary";
    yes.textContent = widget.gate === "local-tool" ? "allow once" : "approve once";
    yes.disabled = busy;
    const no = document.createElement("button");
    no.type = "button";
    no.className = "widget-opt danger";
    no.textContent = "deny";
    no.disabled = busy;
    const gate = widget.gate;
    const requestId = widget.requestId;
    yes.addEventListener("click", () => {
      void window.blob.resolveGate({ entryId: msg.id, requestId, gate, approved: true }).then(apply);
    });
    no.addEventListener("click", () => {
      void window.blob.resolveGate({ entryId: msg.id, requestId, gate, approved: false }).then(apply);
    });
    opts.append(yes, no);
    wrap.append(opts);
  }

  const status = document.createElement("div");
  status.className = "widget-status";
  if (widget.kind === "secret") {
    status.classList.add("warn");
    status.textContent = "open Grok Bot to provide this. Blob does not collect secrets.";
    wrap.append(status);
  } else if (widget.kind === "cursor-agent") {
    status.textContent = "open in Cursor to follow the run.";
    wrap.append(status);
  } else if (widget.pending === false) {
    status.classList.add(widget.status === "denied" ? "warn" : "ok");
    status.textContent = widget.selected
      ? `chose ${clip(widget.selected, 48)}`
      : widget.status
        ? widget.status.replace(/-/g, " ")
        : "done";
    wrap.append(status);
  }
  return wrap;
}

function workingNode(status: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "working";
  wrap.setAttribute("aria-live", "polite");
  wrap.setAttribute("aria-label", "agent is working");
  const face = document.createElement("div");
  face.className = "working-face";
  face.setAttribute("aria-hidden", "true");
  const left = document.createElement("span");
  left.className = "dot";
  const right = document.createElement("span");
  right.className = "dot";
  face.append(left, right);
  const label = document.createElement("span");
  label.className = "working-label";
  if (status === "waiting") label.textContent = "thinking";
  else if (status === "reading") label.textContent = "reading";
  else label.textContent = "working";
  wrap.append(face, label);
  return wrap;
}

function patchSettings(next: SheetState): void {
  agentLine.textContent = "setup";
  patchTokenStatus(next.settings.tokenSet);
  const connecting = next.status === "connecting";
  if (next.error) {
    setSetupStatus(next.error, "err");
    setConnectButton("save & connect", false);
  } else if (holdingSetup && next.status === "connected") {
    setSetupStatus("connected", "ok");
    setConnectButton("connected", true);
  } else if (connecting) {
    setSetupStatus("connecting…", "busy");
    setConnectButton("connecting…", true);
  } else {
    setSetupStatus("", "");
    setConnectButton("save & connect", false);
  }
}

function renderSettings(next: SheetState): void {
  agentLine.textContent = "setup";
  main.replaceChildren();
  const form = document.createElement("form");
  form.className = "settings";
  const tokenSet = next.settings.tokenSet;
  form.innerHTML = `
    <h1>first light</h1>
    <p class="lede">Blob talks to Grok Bot through the host's private gateway. Keep it on localhost, an SSH tunnel, or Tailscale.</p>
    <label>gateway url
      <input id="url" type="url" spellcheck="false" value="${escapeHtml(next.settings.gatewayUrl || DEFAULT_GATEWAY_URL)}" />
    </label>
    <label>token
      <span id="token-status" class="token-status"${tokenSet ? "" : " hidden"}>token saved · <span class="token-mask" aria-hidden="true">••••••••</span></span>
      <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="${tokenSet ? "type to replace" : "paste the gateway token"}" />
    </label>
    <p id="setup-status" class="setup-status" hidden role="status" aria-live="polite"></p>
    <div class="settings-actions">
      <button id="connect-btn" class="primary" type="submit">save &amp; connect</button>
      <button id="settings-back" class="ghost" type="button">back to chat</button>
    </div>
    <p class="hotkey-note">summon with ⌘⇧Space (or ⌘⇧B) · ⌘⇧M display · ⌘F find · ⌘K agents · ⌘⇧R sync · ⌘⇧2 capture · esc hides</p>
  `;
  form.addEventListener("submit", (evt) => {
    evt.preventDefault();
    const url = (form.querySelector("#url") as HTMLInputElement).value;
    const tokenInput = form.querySelector("#token") as HTMLInputElement;
    const token = tokenInput.value;
    setupAttempt = true;
    setSetupStatus("connecting…", "busy");
    setConnectButton("connecting…", true);
    void window.blob
      .saveSettings({ gatewayUrl: url, ...(token.trim() ? { token } : {}) })
      .then((state) => {
        tokenInput.value = "";
        apply(state);
      })
      .catch((err: unknown) => {
        tokenInput.value = "";
        setupAttempt = false;
        const message =
          err instanceof Error && err.message.trim().length > 0 ? err.message : "Fetch failed.";
        const fallback: SheetState = current
          ? { ...current, configured: false, error: message, status: "error" }
          : {
              configured: false,
              settings: { gatewayUrl: url, tokenSet: false },
              agents: [],
              agentId: null,
              messages: [],
              busy: false,
              error: message,
              hotkeyTaken: false,
              status: "error",
              warning: null,
              attachments: [],
            };
        apply(fallback);
      });
  });
  main.append(form);
  const back = form.querySelector("#settings-back") as HTMLButtonElement | null;
  if (back) {
    back.hidden = !next.configured && !(current?.configured);
    back.addEventListener("click", () => leaveSettings());
  }
  patchSettings(next);
}


function agentStatus(agent: AgentRow): { key: string; label: string } {
  if (agent.isComposingMessage) return { key: "composing", label: "composing" };
  if (agent.awaitingUserResponse) return { key: "awaiting", label: "awaiting you" };
  if (agent.isRunning) return { key: "busy", label: "busy" };
  return { key: "idle", label: "idle" };
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 45) return "now";
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function renderRoster(agents: AgentRow[], agentId: string | null): void {
  agentRoster.replaceChildren();
  if (agents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "activity-empty";
    empty.textContent = "no agents";
    agentRoster.append(empty);
    return;
  }
  for (const agent of agents) {
    const status = agentStatus(agent);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "roster-row" + (agent.id === agentId ? " selected" : "");
    btn.title = agent.isGroup ? `${agent.name} (group) · ${status.label}` : `${agent.name} · ${status.label}`;
    applyAgentTint(btn, agentTint(agent));
    const dot = document.createElement("span");
    dot.className = `status-dot ${status.key}`;
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = agent.name;
    const meta = document.createElement("span");
    meta.className = `roster-state ${status.key}`;
    meta.textContent = agent.isGroup ? `${status.label} · group` : status.label;
    btn.append(dot, name, meta);
    btn.addEventListener("click", () => {
      void window.blob.selectAgent(agent.id).then(apply);
    });
    agentRoster.append(btn);
  }
}

function matchAgent(task: ActivityTask, agents: AgentRow[]): AgentRow | undefined {
  // Personal Mine rows use agentName "me" with no agentId — never select a host agent.
  if (!task.agentId && (task.agentName || "").toLowerCase() === "me") return undefined;
  if (task.agentId) {
    const byId = agents.find((agent) => agent.id === task.agentId);
    if (byId) return byId;
  }
  if (task.agentName) {
    const want = task.agentName.toLowerCase();
    return agents.find((agent) => agent.name.toLowerCase() === want);
  }
  return undefined;
}

function paintChron(): void {
  if (!activityChron || !activitySeed) return;
  activitySyncBtn.classList.toggle("syncing", activitySyncing);
  activitySyncBtn.disabled = activitySyncing;
  if (pipelineTab === "mine") {
    activityChron.hidden = true;
    activitySeed.hidden = true;
    return;
  }
  activityChron.hidden = false;
  if (activitySyncing) {
    activityChron.textContent = "syncing…";
  } else {
    activityChron.textContent = formatChronLine(lastCheckedAt, lastChron);
  }
  const ancient = isAncientDemoSeed(lastTasks);
  activitySeed.hidden = !ancient;
}

function applyChron(tasks: ActivityTask[]): void {
  const diff = diffTasks(chronPrev, tasks);
  lastCheckedAt = Date.now();
  if (chronPrev != null) {
    lastChron = diff;
    flashIds = new Set(diff.changedIds);
    flashUntil = Date.now() + 1400;
  }
  chronPrev = tasks;
  lastTasks = tasks;
}

function placeFixed(el: HTMLElement, x: number, y: number): void {
  const pad = 8;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.max(pad, Math.min(x, window.innerWidth - w - pad));
  const top = Math.max(pad, Math.min(y, window.innerHeight - h - pad));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function closeTaskMenu(): void {
  if (taskMenu.hidden) return;
  taskMenu.hidden = true;
  taskMenu.replaceChildren();
  menuTask = null;
}

function closeTaskDetail(): void {
  if (taskDetail.hidden) return;
  taskDetail.hidden = true;
  detailTaskId = null;
  detailExpanded = false;
  taskDetail.classList.remove("expanded");
  taskDetailExtra.hidden = true;
  taskDetailExtra.replaceChildren();
  taskDetailExpand.textContent = "Expand more";
  taskDetailExpand.setAttribute("aria-expanded", "false");
}

function closeTaskUi(): void {
  closeTaskMenu();
  closeTaskDetail();
}

function taskMetaLine(task: ActivityTask): string {
  const bits = [activityStatusLabel(task.status)];
  if (task.agentName) bits.push(task.agentName);
  const when = relTime(task.updatedAt);
  if (when) bits.push(when);
  return bits.join(" · ");
}

function formatUpdatedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function paintTaskDetailExtra(task: ActivityTask): void {
  taskDetailExtra.replaceChildren();
  const rows: Array<[string, string]> = [
    ["id", task.id],
    ["status", activityStatusLabel(task.status)],
  ];
  if (task.agentName) rows.push(["agent", task.agentName]);
  if (task.agentId) rows.push(["agent id", task.agentId]);
  if (typeof task.priority === "number") rows.push(["priority", String(task.priority)]);
  rows.push(["updated", formatUpdatedAt(task.updatedAt)]);
  rows.push(["board", pipelineTab === "mine" ? "Mine" : "Bots"]);
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    taskDetailExtra.append(dt, dd);
  }
}

function syncTaskDetailExpand(): void {
  taskDetail.classList.toggle("expanded", detailExpanded);
  taskDetailExtra.hidden = !detailExpanded;
  taskDetailExpand.textContent = detailExpanded ? "Show less" : "Expand more";
  taskDetailExpand.setAttribute("aria-expanded", detailExpanded ? "true" : "false");
}

function paintTaskDetail(task: ActivityTask): void {
  taskDetailTitle.textContent = task.title;
  taskDetailMeta.textContent = taskMetaLine(task);
  const note = task.note?.trim() ?? "";
  if (note) {
    taskDetailBody.textContent = note;
    taskDetailBody.classList.remove("empty");
  } else {
    taskDetailBody.textContent = "No description yet.";
    taskDetailBody.classList.add("empty");
  }
  paintTaskDetailExtra(task);
  syncTaskDetailExpand();
}

function openTaskDetail(task: ActivityTask, x: number, y: number): void {
  closeTaskMenu();
  closeMsgMenu();
  detailTaskId = task.id;
  detailExpanded = false;
  paintTaskDetail(task);
  taskDetail.hidden = false;
  placeFixed(taskDetail, x, y);
}

function openTaskMenu(task: ActivityTask, x: number, y: number): void {
  closeMsgMenu();
  closeTaskDetail();
  menuTask = task;
  taskMenu.replaceChildren();
  const idx = lastTasks.findIndex((row) => row.id === task.id);
  const last = lastTasks.length - 1;
  const up = document.createElement("button");
  up.type = "button";
  up.className = "msg-menu-item";
  up.setAttribute("role", "menuitem");
  up.textContent = "Move up";
  up.disabled = idx <= 0;
  up.addEventListener("click", () => {
    void moveTask(task.id, -1);
  });
  const down = document.createElement("button");
  down.type = "button";
  down.className = "msg-menu-item";
  down.setAttribute("role", "menuitem");
  down.textContent = "Move down";
  down.disabled = idx < 0 || idx >= last;
  down.addEventListener("click", () => {
    void moveTask(task.id, 1);
  });
  const details = document.createElement("button");
  details.type = "button";
  details.className = "msg-menu-item";
  details.setAttribute("role", "menuitem");
  details.textContent = "Details";
  details.addEventListener("click", () => {
    openTaskDetail(task, x, y);
  });
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "msg-menu-item";
  clear.setAttribute("role", "menuitem");
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    closeTaskMenu();
    void clearTask(task.id);
  });
  if (pipelineTab === "mine") {
    const cycle = document.createElement("button");
    cycle.type = "button";
    cycle.className = "msg-menu-item";
    cycle.setAttribute("role", "menuitem");
    cycle.textContent = "Cycle status";
    cycle.addEventListener("click", () => {
      void cycleMineStatus(task.id);
    });
    taskMenu.append(up, down, details, cycle, clear);
  } else {
    taskMenu.append(up, down, details, clear);
  }
  taskMenu.hidden = false;
  placeFixed(taskMenu, x, y);
}

let dragTaskId: string | null = null;

function clearTaskDropMarks(): void {
  taskList.querySelectorAll(".roster-row.task.drop-before, .roster-row.task.drop-after, .roster-row.task.dragging").forEach((el) => {
    el.classList.remove("drop-before", "drop-after", "dragging");
  });
}

function grabHandle(task: ActivityTask): HTMLElement {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "task-grab";
  handle.title = "Drag to reorder";
  handle.setAttribute("aria-label", "Drag to reorder");
  handle.draggable = true;
  const dots = document.createElement("span");
  dots.className = "task-grab-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i++) {
    dots.append(document.createElement("span"));
  }
  handle.append(dots);
  handle.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });
  handle.addEventListener("dragstart", (evt) => {
    dragTaskId = task.id;
    closeTaskUi();
    if (evt.dataTransfer) {
      evt.dataTransfer.effectAllowed = "move";
      evt.dataTransfer.setData("text/plain", task.id);
      const row = handle.closest(".roster-row.task") as HTMLElement | null;
      if (row) {
        try {
          evt.dataTransfer.setDragImage(row, 16, 12);
        } catch {
          // Some platforms reject custom drag images; default ghost is fine.
        }
      }
    }
    requestAnimationFrame(() => {
      const row = taskList.querySelector(`[data-task-id="${CSS.escape(task.id)}"]`);
      row?.classList.add("dragging");
    });
  });
  handle.addEventListener("dragend", () => {
    dragTaskId = null;
    clearTaskDropMarks();
  });
  return handle;
}

function dropIndexFor(targetId: string, before: boolean): number {
  const targetIdx = lastTasks.findIndex((row) => row.id === targetId);
  if (targetIdx < 0) return -1;
  return before ? targetIdx : targetIdx + 1;
}

function bindTaskDragTarget(row: HTMLElement, task: ActivityTask): void {
  row.addEventListener("dragover", (evt) => {
    const fromId = dragTaskId;
    if (!fromId || fromId === task.id) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
    const rect = row.getBoundingClientRect();
    const before = evt.clientY < rect.top + rect.height / 2;
    row.classList.toggle("drop-before", before);
    row.classList.toggle("drop-after", !before);
    taskList.querySelectorAll(".roster-row.task").forEach((el) => {
      if (el === row) return;
      el.classList.remove("drop-before", "drop-after");
    });
  });
  row.addEventListener("dragleave", (evt) => {
    const related = evt.relatedTarget as Node | null;
    if (related && row.contains(related)) return;
    row.classList.remove("drop-before", "drop-after");
  });
  row.addEventListener("drop", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const fromId = dragTaskId || evt.dataTransfer?.getData("text/plain") || "";
    const before = row.classList.contains("drop-before");
    clearTaskDropMarks();
    if (!fromId || fromId === task.id) return;
    const insertAt = dropIndexFor(task.id, before);
    if (insertAt < 0) return;
    void reorderTask(fromId, insertAt);
  });
}

/** Persist a new pipeline order; array order is Blob Builder priority. */
async function commitTaskOrder(ordered: ActivityTask[], focusId: string): Promise<void> {
  if (activityReordering) return;
  activityReordering = true;
  try {
    const feed =
      pipelineTab === "mine"
        ? await window.blob.setMineTasks(ordered)
        : await window.blob.setActivityTasks(ordered);
    lastCheckedAt = Date.now();
    lastChron = { newCount: 0, updatedCount: 0, removedCount: 0, changedIds: [], summary: "reordered" };
    flashIds = new Set([focusId]);
    flashUntil = Date.now() + 1400;
    if (pipelineTab === "bots") chronPrev = feed.tasks;
    lastTasks = feed.tasks;
    if (panelOpen) {
      renderTasks(feed.tasks, current?.agents ?? []);
      paintChron();
    }
  } catch {
    // Keep the last paint.
  } finally {
    activityReordering = false;
  }
}

/** Swap a visible row in the pipeline (context-menu / a11y fallback). */
async function moveTask(id: string, delta: -1 | 1): Promise<void> {
  const idx = lastTasks.findIndex((task) => task.id === id);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= lastTasks.length) return;
  closeTaskUi();
  const ordered = lastTasks.slice();
  const item = ordered.splice(idx, 1)[0];
  if (!item) return;
  ordered.splice(next, 0, item);
  await commitTaskOrder(ordered, id);
}

/** Drop `id` so it lands at `insertAt` in the pre-remove list (0 = top). */
async function reorderTask(id: string, insertAt: number): Promise<void> {
  if (activityReordering) return;
  const from = lastTasks.findIndex((task) => task.id === id);
  if (from < 0) return;
  let to = Math.max(0, Math.min(insertAt, lastTasks.length));
  if (from < to) to -= 1;
  if (to === from) return;
  closeTaskUi();
  const ordered = lastTasks.slice();
  const item = ordered.splice(from, 1)[0];
  if (!item) return;
  ordered.splice(to, 0, item);
  await commitTaskOrder(ordered, id);
}

async function clearTask(id: string): Promise<void> {
  closeTaskUi();
  try {
    const feed =
      pipelineTab === "mine"
        ? await window.blob.dismissMineTask(id)
        : await window.blob.dismissActivityTask(id);
    if (pipelineTab === "bots") applyChron(feed.tasks);
    else {
      lastTasks = feed.tasks;
      flashIds = new Set([id]);
      flashUntil = Date.now() + 900;
    }
    if (panelOpen) {
      renderTasks(feed.tasks, current?.agents ?? []);
      paintChron();
    }
  } catch {
    // Keep the last paint.
  }
}

const MINE_STATUS_CYCLE = ["next", "waiting", "running", "done"] as const;

async function cycleMineStatus(id: string): Promise<void> {
  closeTaskUi();
  if (pipelineTab !== "mine" || activityReordering) return;
  const idx = lastTasks.findIndex((task) => task.id === id);
  if (idx < 0) return;
  const currentTask = lastTasks[idx];
  if (!currentTask) return;
  const cur = String(currentTask.status).toLowerCase();
  const pos = MINE_STATUS_CYCLE.findIndex((s) => s === cur);
  const nextStatus = MINE_STATUS_CYCLE[(pos + 1) % MINE_STATUS_CYCLE.length] ?? "next";
  const ordered = lastTasks.map((task, i) =>
    i === idx
      ? { ...task, status: nextStatus, updatedAt: new Date().toISOString(), agentName: task.agentName || "me" }
      : task,
  );
  activityReordering = true;
  try {
    const feed = await window.blob.setMineTasks(ordered);
    lastTasks = feed.tasks;
    flashIds = new Set([id]);
    flashUntil = Date.now() + 1400;
    if (panelOpen) {
      renderTasks(feed.tasks, current?.agents ?? []);
      paintChron();
    }
  } catch {
    // Keep the last paint.
  } finally {
    activityReordering = false;
  }
}

async function submitMineTask(): Promise<void> {
  const title = mineInput.value.trim();
  if (!title || activityReordering) return;
  mineInput.value = "";
  try {
    const feed = await window.blob.addMineTask(title);
    lastTasks = feed.tasks;
    flashIds = new Set(feed.tasks[0] ? [feed.tasks[0].id] : []);
    flashUntil = Date.now() + 1400;
    if (panelOpen) {
      renderTasks(feed.tasks, current?.agents ?? []);
      paintChron();
    }
    mineInput.focus();
  } catch {
    // Keep the last paint.
  }
}

function paintPipelineChrome(): void {
  const mine = pipelineTab === "mine";
  pipelineTabBots.classList.toggle("active", !mine);
  pipelineTabMine.classList.toggle("active", mine);
  pipelineTabBots.setAttribute("aria-selected", mine ? "false" : "true");
  pipelineTabMine.setAttribute("aria-selected", mine ? "true" : "false");
  mineCompose.hidden = !mine;
  if (activityNote) {
    activityNote.textContent = mine
      ? "your tasks · local only"
      : "activity.json tasks · agent busy from the host";
  }
  activitySyncBtn.title = mine ? "Reload personal tasks" : "Sync activity";
  activitySyncBtn.setAttribute("aria-label", mine ? "Reload personal tasks" : "Sync activity pipeline");
  paintChron();
}

async function setPipelineTab(tab: PipelineTab): Promise<void> {
  if (pipelineTab === tab) return;
  closeTaskUi();
  pipelineTab = tab;
  try {
    localStorage.setItem(PIPELINE_TAB_KEY, tab);
  } catch {
    // ignore quota / private mode
  }
  paintPipelineChrome();
  await refreshActivityFeed();
}

function renderTasks(tasks: ActivityTask[], agents: AgentRow[]): void {
  lastTasks = tasks;
  if (Date.now() > flashUntil) flashIds = new Set();
  taskList.replaceChildren();
  if (detailTaskId && !tasks.some((task) => task.id === detailTaskId)) closeTaskDetail();
  if (menuTask && !tasks.some((task) => task.id === menuTask?.id)) closeTaskMenu();
  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "activity-empty";
    empty.textContent = pipelineTab === "mine" ? "no personal tasks yet" : "no tasks — write activity.json";
    taskList.append(empty);
    paintChron();
    return;
  }
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (!task) continue;
    const live = matchAgent(task, agents);
    const stale = isStaleTask(task);
    const kind = activityStatusClass(task.status);
    const row = document.createElement("div");
    row.className = "roster-row task" + (stale ? " stale" : "") + (flashIds.has(task.id) ? " flash" : "");
    row.dataset.taskId = task.id;
    row.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      openTaskMenu(task, evt.clientX, evt.clientY);
    });
    const move = grabHandle(task);
    bindTaskDragTarget(row, task);
    const dot = document.createElement("span");
    dot.className = `status-dot ${stale ? "stale" : kind}`;
    dot.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "task-body";
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = task.title;
    body.append(name);
    const chipName = live?.name ?? task.agentName;
    if (chipName) {
      const liveStatus = live ? agentStatus(live) : null;
      const chip = document.createElement(live ? "button" : "span");
      chip.className = "agent-chip" + (liveStatus ? ` ${liveStatus.key}` : "");
      if (live) {
        (chip as HTMLButtonElement).type = "button";
        chip.title = `select ${chipName}`;
        chip.addEventListener("click", () => {
          void window.blob.selectAgent(live.id).then(apply);
        });
      }
      applyAgentTint(
        chip,
        agentTint(live ?? { id: task.agentId || chipName, name: chipName }),
      );
      const chipDot = document.createElement("span");
      chipDot.className = `status-dot ${liveStatus ? liveStatus.key : "idle"}`;
      chipDot.setAttribute("aria-hidden", "true");
      const chipLabel = document.createElement("span");
      chipLabel.textContent = chipName;
      chip.append(chipDot, chipLabel);
      body.append(chip);
    } else {
      const unassigned = document.createElement("span");
      unassigned.className = "agent-chip idle";
      unassigned.textContent = "unassigned";
      body.append(unassigned);
    }
    const meta = document.createElement("span");
    meta.className = "job-meta";
    if (task.status === "done") {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.className = "task-clear";
      tick.title = "Clear";
      tick.setAttribute("aria-label", "Clear");
      tick.textContent = "✓";
      tick.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void clearTask(task.id);
      });
      meta.append(tick);
    }
    const state = document.createElement("span");
    state.className = `roster-state ${stale ? "stale" : kind}`;
    state.textContent = stale ? "stale" : activityStatusLabel(task.status);
    if (task.status === "waiting") state.title = "waiting decision";
    else if (stale) state.title = task.status;
    const when = document.createElement("span");
    when.className = "job-when";
    when.textContent = relTime(task.updatedAt);
    meta.append(state, when);
    row.append(move, dot, body, meta);
    taskList.append(row);
  }
  if (detailTaskId) {
    const open = tasks.find((task) => task.id === detailTaskId);
    if (open) paintTaskDetail(open);
  }
  paintChron();
}

function stopPanelPoll(): void {
  if (panelTimer !== null) {
    window.clearInterval(panelTimer);
    panelTimer = null;
  }
}

function startActivityPoll(): void {
  stopPanelPoll();
  const ms = panelOpen ? OPEN_POLL_MS : CLOSED_POLL_MS;
  panelTimer = window.setInterval(() => {
    void tickActivity();
  }, ms);
}

function paintActivityPanel(agents: AgentRow[], agentId: string | null, tasks: ActivityTask[]): void {
  if (!panelOpen) return;
  renderRoster(agents, agentId);
  renderTasks(tasks, agents);
}

async function tickActivity(): Promise<void> {
  if (activitySyncing || activityReordering) return;
  try {
    if (panelOpen && pipelineTab === "mine") {
      const [state, feed] = await Promise.all([window.blob.refreshRoster(), window.blob.getMineTasks()]);
      if (current) current.agents = state.agents;
      lastTasks = feed.tasks;
      paintActivityPanel(state.agents, current?.agentId ?? state.agentId, feed.tasks);
    } else if (panelOpen) {
      const [state, feed] = await Promise.all([window.blob.refreshRoster(), window.blob.getActivity()]);
      if (current) current.agents = state.agents;
      applyChron(feed.tasks);
      paintActivityPanel(state.agents, current?.agentId ?? state.agentId, feed.tasks);
    } else {
      const feed = await window.blob.getActivity();
      applyChron(feed.tasks);
    }
  } catch {
    // Keep the last paint; a poll blip should not blank the panel.
  }
}

/** Force-read activity.json (or Mine) + roster; shows a brief syncing… on the chron line. */
async function refreshActivityFeed(): Promise<void> {
  if (activitySyncing || activityReordering) return;
  activitySyncing = true;
  paintChron();
  try {
    const feedPromise = pipelineTab === "mine" ? window.blob.getMineTasks() : window.blob.getActivity();
    const [state, feed] = await Promise.all([window.blob.refreshRoster(), feedPromise]);
    if (current) current.agents = state.agents;
    if (pipelineTab === "bots") applyChron(feed.tasks);
    else lastTasks = feed.tasks;
    paintActivityPanel(state.agents, current?.agentId ?? state.agentId, feed.tasks);
  } catch {
    // Keep the last paint; a sync blip should not blank the panel.
  } finally {
    activitySyncing = false;
    paintChron();
  }
}


function paintPanelWidth(): void {
  const px = `${panelWidth}px`;
  activityEl.style.setProperty("--panel-width", px);
  document.documentElement.style.setProperty("--panel-width", px);
  const wide = panelOpen && panelWidth >= PANEL_WIDE_AT;
  activityEl.classList.toggle("pipeline-expanded", wide);
  panelSplit.hidden = !panelOpen;
}

async function commitPanelWidth(width: number): Promise<void> {
  panelWidth = clampPanelWidth(width);
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
  } catch {
    // ignore
  }
  paintPanelWidth();
  if (!panelOpen) return;
  try {
    await window.blob.setPanelWidth(panelWidth);
  } catch {
    // CSS width still applies inside current window bounds.
  }
}

async function setPanel(open: boolean): Promise<void> {
  if (panelOpen === open) return;
  panelOpen = open;
  activityToggle.setAttribute("aria-pressed", open ? "true" : "false");
  if (open) {
    try {
      await window.blob.setPanelOpen(true);
      await window.blob.setPanelWidth(panelWidth);
    } catch {
      // Resize is best-effort; the panel still works inside the current bounds.
    }
    activityEl.hidden = false;
    panelSplit.hidden = false;
    paintPanelWidth();
    await tickActivity();
    startActivityPoll();
  } else {
    closeTaskUi();
    activityEl.hidden = true;
    panelSplit.hidden = true;
    activityEl.classList.remove("pipeline-expanded");
    try {
      await window.blob.setPanelOpen(false);
    } catch {
      // ignore
    }
    paintPanelWidth();
    startActivityPoll();
  }
}

async function submitPrompt(): Promise<void> {
  const text = promptEl.value.trim();
  const hasAttach = (current?.attachments.length ?? 0) > 0;
  if ((!text && !hasAttach) || sending) return;
  const parent = replyTarget;
  sending = true;
  promptEl.value = "";
  sendBtn.disabled = true;
  promptEl.disabled = true;
  setReply(null);
  if (current?.configured) {
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", text };
    if (parent) {
      optimistic.replyToId = parent.id;
      optimistic.replyTo = {
        id: parent.id,
        role: parent.role,
        text: clip(parent.text || parent.widget?.prompt || ""),
      };
    }
    apply({
      ...current,
      busy: true,
      status: "sending",
      error: null,
      messages: [...current.messages, optimistic],
    });
  }
  try {
    const next = await window.blob.sendPrompt(text, parent?.id);
    apply(next);
  } finally {
    sending = false;
    promptEl.disabled = false;
    sendBtn.disabled = false;
    promptEl.focus();
  }
}

promptEl.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter" && !evt.shiftKey) {
    evt.preventDefault();
    void submitPrompt();
  }
});

sendBtn.addEventListener("click", () => {
  void submitPrompt();
});

async function runCapture(mode: "region" | "screen"): Promise<void> {
  if (sending || !current?.configured || holdingSetup) return;
  captureBtn.disabled = true;
  try {
    const next = await window.blob.capture(mode);
    apply(next);
  } finally {
    captureBtn.disabled = sending;
    promptEl.focus();
  }
}

captureBtn.addEventListener("click", (evt) => {
  void runCapture(evt.altKey ? "screen" : "region");
});

promptEl.addEventListener("paste", (evt) => {
  const items = evt.clipboardData?.items;
  if (!items) return;
  const hasImage = Array.from(items).some((item) => item.type.startsWith("image/"));
  if (!hasImage) return;
  evt.preventDefault();
  void window.blob.attachClipboard().then(apply);
});


async function runSync(): Promise<void> {
  if (syncingUi || sending) return;
  syncingUi = true;
  if (current) apply({ ...current, status: "syncing", error: null });
  else {
    banner.hidden = false;
    banner.textContent = "syncing…";
    banner.className = "banner busy";
    syncBtn.classList.add("syncing");
    syncBtn.disabled = true;
  }
  try {
    const next = await window.blob.sync();
    apply(next);
    await refreshActivityFeed();
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim().length > 0 ? err.message : "Sync failed.";
    if (current) apply({ ...current, error: message, status: "error" });
    else {
      banner.hidden = false;
      banner.textContent = message;
      banner.className = "banner err";
      syncBtn.classList.remove("syncing");
      syncBtn.disabled = false;
    }
  } finally {
    if (current?.status !== "syncing") syncingUi = false;
  }
}

syncBtn.addEventListener("click", () => {
  void runSync();
});

activitySyncBtn.addEventListener("click", () => {
  void refreshActivityFeed();
});

paintPipelineChrome();

pipelineTabBots.addEventListener("click", () => {
  void setPipelineTab("bots");
});
pipelineTabMine.addEventListener("click", () => {
  void setPipelineTab("mine");
});
mineAddBtn.addEventListener("click", () => {
  void submitMineTask();
});
mineInput.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter") {
    evt.preventDefault();
    void submitMineTask();
  }
});

paintPanelWidth();

panelSplit.addEventListener("pointerdown", (evt) => {
  if (evt.button !== 0 || !panelOpen) return;
  evt.preventDefault();
  panelResizing = true;
  panelResizeStartX = evt.screenX;
  panelResizeStartW = panelWidth;
  panelSplit.classList.add("dragging");
  document.body.classList.add("panel-resizing");
  try {
    panelSplit.setPointerCapture(evt.pointerId);
  } catch {
    // fine without capture
  }
});

window.addEventListener("pointermove", (evt) => {
  if (!panelResizing) return;
  // Dragging the split left grows the pipeline (panel is on the right).
  const next = clampPanelWidth(panelResizeStartW + (panelResizeStartX - evt.screenX));
  panelWidth = next;
  paintPanelWidth();
});

function endPanelResize(evt: PointerEvent): void {
  if (!panelResizing) return;
  panelResizing = false;
  panelSplit.classList.remove("dragging");
  document.body.classList.remove("panel-resizing");
  try {
    if (panelSplit.hasPointerCapture(evt.pointerId)) panelSplit.releasePointerCapture(evt.pointerId);
  } catch {
    // already released
  }
  void commitPanelWidth(panelWidth);
}

window.addEventListener("pointerup", (evt) => {
  endPanelResize(evt);
});

window.addEventListener("pointercancel", (evt) => {
  endPanelResize(evt);
});

activityToggle.addEventListener("click", () => {
  void setPanel(!panelOpen);
});

gear.addEventListener("click", () => {
  closeFind({ restoreFocus: false });
  closePicker({ restoreFocus: false });
  closeMsgMenu();
  if (viewingSettings && current?.configured) {
    leaveSettings();
    return;
  }
  holdingSetup = false;
  setupAttempt = false;
  viewingSettings = true;
  if (setupHoldTimer !== null) {
    window.clearTimeout(setupHoldTimer);
    setupHoldTimer = null;
  }
  void window.blob.openSettings().then(apply);
});

replyBarClear.addEventListener("click", () => setReply(null));

findInput.addEventListener("input", () => {
  runFind(findInput.value);
});

findInput.addEventListener("keydown", (evt) => {
  if (evt.key === "Enter") {
    evt.preventDefault();
    findStep(evt.shiftKey ? -1 : 1);
  }
});

findPrevBtn.addEventListener("click", () => findStep(-1));
findNextBtn.addEventListener("click", () => findStep(1));
findCloseBtn.addEventListener("click", () => closeFind());

pickerInput.addEventListener("input", () => {
  paintPicker();
});

pickerInput.addEventListener("keydown", (evt) => {
  if (evt.key === "ArrowDown") {
    evt.preventDefault();
    pickerStep(1);
  } else if (evt.key === "ArrowUp") {
    evt.preventDefault();
    pickerStep(-1);
  } else if (evt.key === "Enter") {
    evt.preventDefault();
    const agent = pickerHits[pickerIndex];
    if (agent) void pickAgent(agent.id);
  }
});

pickerEl.addEventListener("click", (evt) => {
  if (evt.target === pickerEl) closePicker();
});

msgMenu.addEventListener("contextmenu", (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
});

taskMenu.addEventListener("contextmenu", (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
});

document.addEventListener("pointerdown", (evt) => {
  const target = evt.target;
  if (!(target instanceof Node)) {
    closeMsgMenu();
    closeTaskUi();
    return;
  }
  if (!msgMenu.hidden && !msgMenu.contains(target)) closeMsgMenu();
  if (!taskMenu.hidden && !taskMenu.contains(target)) closeTaskMenu();
  if (!taskDetail.hidden && !taskDetail.contains(target)) closeTaskDetail();
});

main.addEventListener("scroll", () => {
  closeMsgMenu();
  closeTaskUi();
});

activityEl.addEventListener("scroll", () => {
  closeTaskUi();
});

window.addEventListener("resize", () => {
  closeMsgMenu();
  closeTaskUi();
});

function isChromeControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, input, textarea, select, a") !== null;
}

let chromeDragging = false;
let lockedMainScrollTop: number | null = null;
let lockedActivityScrollTop: number | null = null;

function endChromeDrag(evt: PointerEvent): void {
  if (!chromeDragging) return;
  chromeDragging = false;
  document.documentElement.classList.remove("chrome-dragging");
  try {
    if (chromeEl.hasPointerCapture(evt.pointerId)) chromeEl.releasePointerCapture(evt.pointerId);
  } catch {
    // Pointer already released.
  }
  if (lockedMainScrollTop !== null) main.scrollTop = lockedMainScrollTop;
  if (lockedActivityScrollTop !== null) activityEl.scrollTop = lockedActivityScrollTop;
  lockedMainScrollTop = null;
  lockedActivityScrollTop = null;
  window.blob.chromeDrag({ phase: "end", x: evt.screenX, y: evt.screenY });
}

chromeEl.addEventListener("pointerdown", (evt) => {
  if (evt.button !== 0) return;
  if (isChromeControl(evt.target)) return;
  chromeDragging = true;
  lockedMainScrollTop = main.scrollTop;
  lockedActivityScrollTop = activityEl.scrollTop;
  document.documentElement.classList.add("chrome-dragging");
  try {
    chromeEl.setPointerCapture(evt.pointerId);
  } catch {
    // Some platforms reject capture; wheel lock below still helps.
  }
  window.blob.chromeDrag({ phase: "start", x: evt.screenX, y: evt.screenY });
});

window.addEventListener("pointermove", (evt) => {
  if (!chromeDragging) return;
  // Trackpad pans during a window move can nudge scroll; pin it.
  if (lockedMainScrollTop !== null) main.scrollTop = lockedMainScrollTop;
  if (lockedActivityScrollTop !== null) activityEl.scrollTop = lockedActivityScrollTop;
  window.blob.chromeDrag({ phase: "move", x: evt.screenX, y: evt.screenY });
});

window.addEventListener("pointerup", (evt) => {
  endChromeDrag(evt);
});

window.addEventListener("pointercancel", (evt) => {
  endChromeDrag(evt);
});

// Swallow wheel while dragging so the transcript does not roll under the move.
window.addEventListener(
  "wheel",
  (evt) => {
    if (!chromeDragging) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (lockedMainScrollTop !== null) main.scrollTop = lockedMainScrollTop;
    if (lockedActivityScrollTop !== null) activityEl.scrollTop = lockedActivityScrollTop;
  },
  { capture: true, passive: false },
);

taskDetailExpand.addEventListener("click", (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
  detailExpanded = !detailExpanded;
  const open = lastTasks.find((task) => task.id === detailTaskId);
  if (open) paintTaskDetail(open);
  else syncTaskDetailExpand();
  // Re-clamp after size change so the card stays on-screen.
  const rect = taskDetail.getBoundingClientRect();
  placeFixed(taskDetail, rect.left, rect.top);
});

chromeEl.addEventListener(
  "wheel",
  (evt) => {
    onHeaderWheel(evt);
  },
  { capture: true, passive: false },
);

document.addEventListener("keydown", (evt) => {
  const mod = evt.metaKey || evt.ctrlKey;
  if (mod && evt.key.toLowerCase() === "f" && !evt.shiftKey && !evt.altKey) {
    evt.preventDefault();
    openFind();
    return;
  }
  if (mod && evt.key.toLowerCase() === "g" && findOpen && !evt.altKey) {
    evt.preventDefault();
    findStep(evt.shiftKey ? -1 : 1);
    return;
  }
  if (mod && evt.key.toLowerCase() === "k" && !evt.shiftKey && !evt.altKey) {
    evt.preventDefault();
    openPicker();
    return;
  }
  if (mod && evt.shiftKey && !evt.altKey && evt.code === "BracketRight") {
    evt.preventDefault();
    cycleAgent(1);
    return;
  }
  if (mod && evt.shiftKey && !evt.altKey && evt.code === "BracketLeft") {
    evt.preventDefault();
    cycleAgent(-1);
    return;
  }
  if (mod && evt.shiftKey && !evt.altKey && evt.code === "Digit2") {
    evt.preventDefault();
    void runCapture("region");
    return;
  }
  if (mod && evt.shiftKey && !evt.altKey && evt.key.toLowerCase() === "r") {
    evt.preventDefault();
    void runSync();
    return;
  }
  if (mod && !evt.shiftKey && !evt.altKey) {
    const digit = evt.code.match(/^Digit([1-9])$/);
    if (digit) {
      evt.preventDefault();
      jumpAgent(Number(digit[1]));
      return;
    }
  }
  if (evt.key === "Escape") {
    evt.preventDefault();
    if (!taskDetail.hidden) {
      closeTaskDetail();
      return;
    }
    if (!taskMenu.hidden) {
      closeTaskMenu();
      return;
    }
    if (!msgMenu.hidden) {
      closeMsgMenu();
      return;
    }
    if (pickerOpen) {
      closePicker();
      return;
    }
    if (findOpen) {
      closeFind();
      return;
    }
    if (replyTarget) {
      setReply(null);
      return;
    }
    if (viewingSettings && current?.configured) {
      leaveSettings();
      return;
    }
    void window.blob.hide();
  }
});

window.blob.onFocusInput(() => {
  promptEl.focus();
});

window.blob.onOpenFind(() => {
  openFind();
});

window.blob.onOpenPicker(() => {
  openPicker();
});

window.blob.onCycleAgent((delta) => {
  cycleAgent(delta);
});

window.blob.onJumpAgent((n) => {
  jumpAgent(n);
});

window.blob.onState((next) => {
  apply(next);
});

void window.blob.bootstrap().then((state) => {
  apply(state);
  startActivityPoll();
  void tickActivity();
});
