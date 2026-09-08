import { Menu, Tray, app, nativeImage } from "electron";
import { join } from "node:path";
import { moveToNextDisplay, summonWindow, toggleWindow } from "./window";

let tray: Tray | null = null;

function iconPath(): string {
  return join(__dirname, "..", "assets", "trayTemplate.png");
}

export function createTray(): Tray {
  if (tray) return tray;
  const image = nativeImage.createFromPath(iconPath());
  if (process.platform === "darwin") image.setTemplateImage(true);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("Blob");
  tray.on("click", () => toggleWindow());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: () => summonWindow() },
      { label: "Move to next display", click: () => moveToNextDisplay() },
      { type: "separator" },
      { label: "Quit Blob", click: () => app.quit() },
    ]),
  );
  return tray;
}
