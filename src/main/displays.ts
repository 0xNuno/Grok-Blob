import { screen, type Display, type Rectangle } from "electron";

/** Identifies a display across disconnect/reconnect, where Display.id is not stable. */
export type DisplaySignature = {
  id: number;
  width: number;
  height: number;
  scaleFactor: number;
  internal: boolean;
};

export function signature(d: Display): DisplaySignature {
  return {
    id: d.id,
    width: d.size.width,
    height: d.size.height,
    scaleFactor: d.scaleFactor,
    internal: d.internal === true,
  };
}

/**
 * Display.id is not stable across disconnect/reconnect, so match on id first and
 * fall back to a geometry signature.
 */
export function findDisplay(sig: DisplaySignature | null): Display {
  const all = screen.getAllDisplays();
  if (!sig) return screen.getPrimaryDisplay();
  return (
    all.find((d) => d.id === sig.id) ??
    all.find(
      (d) => d.size.width === sig.width && d.size.height === sig.height && d.internal === sig.internal,
    ) ??
    all.find((d) => d.internal === sig.internal) ??
    screen.getPrimaryDisplay()
  );
}

/** Keep the whole window inside a work area, shrinking it if the display got smaller. */
export function clampToWorkArea(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width,
    height,
    x: Math.round(Math.min(Math.max(bounds.x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(bounds.y, area.y), area.y + area.height - height)),
  };
}

/** Laptop/internal first, then other displays (stable by id). */
export function orderedDisplays(): Display[] {
  return screen.getAllDisplays().slice().sort((a, b) => {
    const ai = a.internal === true ? 0 : 1;
    const bi = b.internal === true ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return a.id - b.id;
  });
}

/** Same relative position on the next display in laptop→secondary order, clamped to its work area. */
export function nextDisplayBounds(bounds: Rectangle): { bounds: Rectangle; display: Display } | null {
  const all = orderedDisplays();
  if (all.length < 2) return null;
  const current = screen.getDisplayMatching(bounds);
  const index = all.findIndex((d) => d.id === current.id);
  const next = all[(index < 0 ? 0 : index + 1) % all.length];
  const from = current.workArea;
  const to = next.workArea;
  const relX = from.width > 0 ? (bounds.x - from.x) / from.width : 0;
  const relY = from.height > 0 ? (bounds.y - from.y) / from.height : 0;
  const moved = {
    width: bounds.width,
    height: bounds.height,
    x: Math.round(to.x + relX * to.width),
    y: Math.round(to.y + relY * to.height),
  };
  return { bounds: clampToWorkArea(moved, to), display: next };
}
