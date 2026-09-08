import { app, BrowserWindow, screen, type Rectangle } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ipc } from "../shared/ipc";
import {
  clampToWorkArea,
  findDisplay,
  nextDisplayBounds,
  signature,
  type DisplaySignature,
} from "./displays";

let win: BrowserWindow | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let displayListenersBound = false;
let lastPlacement: PersistedWindow | null = null;
let captureLock = false;

type ChromeDragOrigin = {
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  mx: number;
  my: number;
};
let chromeDrag: ChromeDragOrigin | null = null;

function finiteCoord(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Frameless sheet: CSS drag swallows wheel, so chrome is no-drag and we move here. */
export function handleChromeDrag(payload: unknown): void {
  const w = getWindow();
  if (!w || w.isDestroyed() || captureLock) return;
  if (typeof payload !== "object" || payload === null) return;
  const msg = payload as { phase?: unknown; x?: unknown; y?: unknown };
  const x = finiteCoord(msg.x);
  const y = finiteCoord(msg.y);
  if (x === null || y === null) return;
  if (msg.phase === "start") {
    const b = w.getBounds();
    chromeDrag = { wx: b.x, wy: b.y, ww: b.width, wh: b.height, mx: x, my: y };
    return;
  }
  if (msg.phase === "end") {
    chromeDrag = null;
    persistBounds();
    return;
  }
  if (msg.phase === "move" && chromeDrag) {
    w.setBounds({
      x: chromeDrag.wx + (x - chromeDrag.mx),
      y: chromeDrag.wy + (y - chromeDrag.my),
      width: chromeDrag.ww,
      height: chromeDrag.wh,
    });
  }
}

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 580;
const PANEL_DEFAULT = 252;
const PANEL_MIN = 220;
const PANEL_MAX = 520;
/** Floor so the sheet cannot be dragged into a useless stub. */
const BASE_MIN_WIDTH = 400;
const BASE_MIN_HEIGHT = 520;
let panelOpen = false;
let panelWidth = PANEL_DEFAULT;

/** Position + display only — size is always the design default on summon. */
type PersistedWindow = {
  x: number;
  y: number;
  display: DisplaySignature | null;
};

function clampPanelWidth(n: number): number {
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(n)));
}

function panelSideWidth(): number {
  return panelWidth;
}

function designSize(): { width: number; height: number } {
  return {
    width: panelOpen ? DEFAULT_WIDTH + panelSideWidth() : DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

function minSize(): { width: number; height: number } {
  return {
    width: panelOpen ? BASE_MIN_WIDTH + panelSideWidth() : BASE_MIN_WIDTH,
    height: BASE_MIN_HEIGHT,
  };
}

function preloadPath(): string {
  return join(__dirname, "..", "preload.js");
}

function pagePath(): string {
  return join(__dirname, "..", "renderer", "index.html");
}

function statePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}

function clampFinite(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function coerceDisplay(raw: unknown): DisplaySignature | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  return {
    id: clampFinite(d.id, 0, 0, Number.MAX_SAFE_INTEGER),
    width: clampFinite(d.width, 0, 0, 100000),
    height: clampFinite(d.height, 0, 0, 100000),
    scaleFactor: clampFinite(d.scaleFactor, 1, 0.5, 8),
    internal: d.internal === true,
  };
}

function loadPlacement(): PersistedWindow | null {
  const path = statePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    if (typeof raw.x !== "number" || typeof raw.y !== "number") return null;
    // Ignore any legacy width/height — summon always uses the design default.
    return {
      x: raw.x,
      y: raw.y,
      display: coerceDisplay(raw.display),
    };
  } catch {
    return null;
  }
}

function writePlacement(state: PersistedWindow): void {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(), JSON.stringify(state, null, 2), { encoding: "utf8" });
}

function capturePlacement(): PersistedWindow | null {
  const w = getWindow();
  if (!w || w.isDestroyed() || w.isMinimized()) return null;
  const b = w.getBounds();
  lastPlacement = {
    x: b.x,
    y: b.y,
    display: signature(screen.getDisplayMatching(b)),
  };
  writePlacement(lastPlacement);
  return lastPlacement;
}

function persistBounds(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    capturePlacement();
  }, 250);
}

function persistBoundsNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  capturePlacement();
}

function initialBounds(): Rectangle | null {
  lastPlacement = loadPlacement();
  if (!lastPlacement) return null;
  const display = findDisplay(lastPlacement.display);
  const size = designSize();
  return clampToWorkArea(
    {
      x: lastPlacement.x,
      y: lastPlacement.y,
      width: size.width,
      height: size.height,
    },
    display.workArea,
  );
}

/** Summon/hide cycle: always the overlay design size; keep current/persisted position. */
function applySummonBounds(w: BrowserWindow): void {
  const size = designSize();
  const mins = minSize();
  const current = w.getBounds();
  const work = screen.getDisplayMatching(current).workArea;
  const next = clampToWorkArea(
    { x: current.x, y: current.y, width: size.width, height: size.height },
    work,
  );
  w.setMinimumSize(mins.width, mins.height);
  w.setBounds(next);
}

function bindDisplayListeners(): void {
  if (displayListenersBound) return;
  displayListenersBound = true;
  const onDisplayChange = (): void => {
    reclampToKnownDisplay();
  };
  screen.on("display-added", onDisplayChange);
  screen.on("display-removed", onDisplayChange);
  screen.on("display-metrics-changed", onDisplayChange);
}

/** After a display change, pull the sheet back onto a display that still exists. */
function reclampToKnownDisplay(): void {
  const w = getWindow();
  if (!w || w.isDestroyed()) return;
  const b = w.getBounds();
  const known = findDisplay(lastPlacement?.display ?? null);
  const area = known.workArea;
  const stillVisible =
    b.x >= area.x - 40 && b.x + b.width <= area.x + area.width + 40 && b.y >= area.y - 40;
  const target = clampToWorkArea(b, stillVisible ? area : findDisplay(null).workArea);
  if (target.x !== b.x || target.y !== b.y || target.width !== b.width || target.height !== b.height) {
    w.setBounds(target);
  }
  persistBounds();
}

export function getWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

export function createWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;

  const darwin = process.platform === "darwin";
  const restored = initialBounds();
  const size = designSize();
  const mins = minSize();
  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    ...(restored ? { x: restored.x, y: restored.y } : {}),
    minWidth: mins.width,
    minHeight: mins.height,
    show: false,
    frame: false,
    transparent: darwin,
    backgroundColor: darwin ? "#00000000" : "#141210",
    skipTaskbar: darwin,
    fullscreenable: false,
    alwaysOnTop: false,
    resizable: true,
    hasShadow: true,
    ...(darwin ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.on("moved", persistBounds);
  win.on("resized", persistBounds);
  win.on("close", persistBoundsNow);

  bindDisplayListeners();
  void win.loadFile(pagePath());
  persistBounds();
  return win;
}

export function hideWindow(): void {
  const w = getWindow();
  if (w && w.isVisible()) w.hide();
}

/** While true, summon/toggle must not re-show the sheet (screencapture is up). */
export function setCaptureLock(locked: boolean): void {
  captureLock = locked;
}

export function summonWindow(): void {
  if (captureLock) return;
  const w = createWindow();
  if (w.isMinimized()) w.restore();
  // Always open at the design overlay size (session resize does not stick across summon).
  applySummonBounds(w);
  w.show();
  w.focus();
  w.webContents.send(Ipc.focusInput);
}

export function toggleWindow(): void {
  if (captureLock) return;
  const w = getWindow();
  if (w && w.isVisible()) {
    w.hide();
    return;
  }
  summonWindow();
}

/** Cycle the sheet onto the next display. Harmless no-op with a single screen. */
export function moveToNextDisplay(): void {
  const w = getWindow();
  if (!w) return;
  const moved = nextDisplayBounds(w.getBounds());
  if (!moved) return;
  w.setBounds(moved.bounds);
  persistBounds();
}

export function setActivityPanel(open: boolean): void {
  const win = getWindow();
  if (!win || panelOpen === open) return;
  const bounds = win.getBounds();
  const side = panelSideWidth();
  const nextWidth = open
    ? bounds.width + side
    : Math.max(BASE_MIN_WIDTH, bounds.width - side);
  const work = screen.getDisplayMatching(bounds).workArea;
  let x = bounds.x;
  if (open && x + nextWidth > work.x + work.width) {
    x = Math.max(work.x, work.x + work.width - nextWidth);
  }
  panelOpen = open;
  const mins = minSize();
  win.setMinimumSize(mins.width, mins.height);
  win.setBounds({ x, y: bounds.y, width: nextWidth, height: bounds.height });
  persistBounds();
}

/** Set the open activity panel width (px). Grows/shrinks the window by the delta. */
export function setPanelWidth(width: unknown): number {
  const next = clampPanelWidth(typeof width === "number" ? width : PANEL_DEFAULT);
  const win = getWindow();
  if (!win || !panelOpen) {
    panelWidth = next;
    return panelWidth;
  }
  if (next === panelWidth) return panelWidth;
  const bounds = win.getBounds();
  const delta = next - panelWidth;
  const nextWidth = Math.max(BASE_MIN_WIDTH + next, bounds.width + delta);
  const work = screen.getDisplayMatching(bounds).workArea;
  let x = bounds.x;
  if (delta > 0 && x + nextWidth > work.x + work.width) {
    x = Math.max(work.x, work.x + work.width - nextWidth);
  }
  panelWidth = next;
  const mins = minSize();
  win.setMinimumSize(mins.width, mins.height);
  win.setBounds({ x, y: bounds.y, width: nextWidth, height: bounds.height });
  persistBounds();
  return panelWidth;
}

export function getPanelWidth(): number {
  return panelWidth;
}
