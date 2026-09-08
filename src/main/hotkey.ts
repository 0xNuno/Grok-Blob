import { globalShortcut } from "electron";
import { DISPLAY_HOTKEY, HOTKEY, HOTKEY_ALT } from "../shared/types";
import { moveToNextDisplay, toggleWindow } from "./window";

let taken = false;

export function isHotkeyTaken(): boolean {
  return taken;
}

export function registerHotkey(): boolean {
  const summonOk = globalShortcut.register(HOTKEY, () => toggleWindow());
  const altOk = globalShortcut.register(HOTKEY_ALT, () => toggleWindow());
  // Only warn if both summon chords failed — one working is enough.
  taken = !(summonOk || altOk);
  if (!summonOk) {
    console.warn("primary summon hotkey already taken", HOTKEY);
  }
  if (!altOk) {
    console.warn("fallback summon hotkey already taken", HOTKEY_ALT);
  }
  if (taken) {
    console.warn("all summon hotkeys already taken");
  }
  const displayOk = globalShortcut.register(DISPLAY_HOTKEY, () => moveToNextDisplay());
  if (!displayOk) {
    console.warn("display hotkey already taken");
  }
  return summonOk || altOk;
}

export function unregisterHotkey(): void {
  globalShortcut.unregister(HOTKEY);
  globalShortcut.unregister(HOTKEY_ALT);
  globalShortcut.unregister(DISPLAY_HOTKEY);
  globalShortcut.unregisterAll();
}
