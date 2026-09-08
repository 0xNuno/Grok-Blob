import { clipboard, nativeImage, shell } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AttachmentChip } from "../shared/types";
import { getWindow, setCaptureLock, summonWindow } from "./window";

/**
 * Capture hides the sheet, waits for the hide to land, then runs macOS
 * `screencapture`. Hiding first is mandatory: at panel level the overlay
 * otherwise lands in the shot.
 *
 * Bytes stay in main. The renderer only sees a chip (size + thumbnail).
 */

export type CaptureMode = "region" | "screen";

export type PendingAttachment = {
  id: string;
  kind: "image";
  mediaType: string;
  bytes: number;
  data: string;
  filePath: string;
  thumb: string;
};

const MAX_BYTES = 5 * 1024 * 1024;
const HIDE_WAIT_MS = 250;

let pending: PendingAttachment[] = [];
let inFlight = false;

export function listPending(): AttachmentChip[] {
  return pending.map(({ id, kind, mediaType, bytes, thumb }) => ({
    id,
    kind,
    mediaType,
    bytes,
    thumb,
  }));
}

export function peekPending(): PendingAttachment[] {
  return pending.slice();
}

export function takePending(): PendingAttachment[] {
  const taken = pending;
  pending = [];
  return taken;
}

export function removePending(id: string): void {
  const next: PendingAttachment[] = [];
  for (const item of pending) {
    if (item.id === id) {
      unlinkNow(item.filePath);
      continue;
    }
    next.push(item);
  }
  pending = next;
}

export function clearPending(): void {
  for (const item of pending) unlinkNow(item.filePath);
  pending = [];
}

export function scheduleUnlink(filePath: string): void {
  if (!filePath) return;
  setTimeout(() => {
    void unlink(filePath).catch(() => {});
  }, 60_000);
}

/** Best-effort immediate delete for capture temps after send or drop. */
export function unlinkNow(filePath: string): void {
  if (!filePath) return;
  void unlink(filePath).catch(() => {});
}

function thumbnail(buffer: Buffer): string {
  const img = nativeImage.createFromBuffer(buffer);
  const size = img.getSize();
  if (size.width <= 0 || size.height <= 0) return "";
  const max = 120;
  const scaled =
    size.width > max || size.height > max
      ? img.resize({
          width: size.width >= size.height ? max : Math.max(1, Math.round((size.width / size.height) * max)),
          quality: "better",
        })
      : img;
  return scaled.toDataURL();
}

function addFromBuffer(buffer: Buffer, filePath: string): { ok: boolean; reason?: string } {
  if (buffer.length === 0) return { ok: false, reason: "empty image" };
  if (buffer.length > MAX_BYTES) {
    scheduleUnlink(filePath);
    return {
      ok: false,
      reason: `image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit`,
    };
  }
  pending.push({
    id: randomUUID(),
    kind: "image",
    mediaType: "image/png",
    bytes: buffer.length,
    data: buffer.toString("base64"),
    filePath,
    thumb: thumbnail(buffer),
  });
  return { ok: true };
}

export function attachFromClipboard(): { ok: boolean; reason?: string } {
  const image = clipboard.readImage();
  if (image.isEmpty()) return { ok: false, reason: "no image on the clipboard" };
  const buffer = image.toPNG();
  const file = join(tmpdir(), `blob-${randomUUID()}.png`);
  try {
    writeFileSync(file, buffer);
  } catch {
    return { ok: false, reason: "could not save clipboard image" };
  }
  return addFromBuffer(buffer, file);
}

async function waitUntilHidden(): Promise<boolean> {
  const panel = getWindow();
  const wasVisible = panel?.isVisible() === true;
  if (!wasVisible || !panel) return false;
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, HIDE_WAIT_MS);
    panel.once("hide", done);
    panel.hide();
  });
  return true;
}

function screencaptureArgs(mode: CaptureMode, file: string): string[] {
  // -x silences the shutter; -i is interactive region (or window, via space).
  if (mode === "region") return ["-i", "-x", file];
  return ["-x", file];
}

export async function capture(mode: CaptureMode): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Screen capture is Mac-only." };
  }
  if (inFlight) return { ok: false, reason: "Capture already in progress." };
  inFlight = true;
  setCaptureLock(true);
  const file = join(tmpdir(), `blob-${randomUUID()}.png`);
  let wasVisible = false;
  let ok = false;
  try {
    wasVisible = await waitUntilHidden();
    await new Promise<void>((resolve, reject) => {
      execFile("/usr/sbin/screencapture", screencaptureArgs(mode, file), (err) =>
        err ? reject(err) : resolve(),
      );
    });
    const buffer = await readFile(file);
    const result = addFromBuffer(buffer, file);
    ok = result.ok;
    return result;
  } catch (err) {
    await unlink(file).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    if (/could not create image/i.test(message)) {
      return {
        ok: false,
        reason:
          "Screen Recording is not granted. Add Blob in System Settings › Privacy & Security › Screen & System Audio Recording.",
      };
    }
    return { ok: false, reason: "Capture cancelled." };
  } finally {
    inFlight = false;
    setCaptureLock(false);
    if (wasVisible || ok) summonWindow();
  }
}

export function openScreenRecordingSettings(): void {
  void shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  );
}
