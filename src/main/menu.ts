import { Menu, app } from "electron";
import { Ipc } from "../shared/ipc";
import { CAPTURE_HOTKEY, SYNC_HOTKEY } from "../shared/types";
import { captureSheet, syncWithHost } from "./session";
import { getWindow, moveToNextDisplay, summonWindow } from "./window";

function sendToSheet(channel: string, ...args: unknown[]): void {
  const w = getWindow();
  if (!w) return;
  if (!w.isVisible()) w.show();
  w.focus();
  w.webContents.send(channel, ...args);
}

export function installAppMenu(): void {
  const isMac = process.platform === "darwin";
  const jumpItems: Electron.MenuItemConstructorOptions[] = [];
  for (let n = 1; n <= 9; n++) {
    jumpItems.push({
      label: `Agent ${n}`,
      accelerator: `CommandOrControl+${n}`,
      click: () => sendToSheet(Ipc.jumpAgent, n),
    });
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: "CommandOrControl+F",
          click: () => sendToSheet(Ipc.openFind),
        },
        {
          label: "Sync with Host",
          accelerator: SYNC_HOTKEY,
          click: () => {
            void syncWithHost();
          },
        },
        { type: "separator" },
        {
          label: "Capture Region",
          accelerator: CAPTURE_HOTKEY,
          click: () => {
            void captureSheet("region");
          },
        },
        {
          label: "Capture Screen",
          click: () => {
            void captureSheet("screen");
          },
        },
      ],
    },
    {
      label: "Agents",
      submenu: [
        {
          label: "Switch Agent…",
          accelerator: "CommandOrControl+K",
          click: () => sendToSheet(Ipc.openPicker),
        },
        {
          label: "Next Agent",
          accelerator: "CommandOrControl+Shift+]",
          click: () => sendToSheet(Ipc.cycleAgent, 1),
        },
        {
          label: "Previous Agent",
          accelerator: "CommandOrControl+Shift+[",
          click: () => sendToSheet(Ipc.cycleAgent, -1),
        },
        { type: "separator" },
        ...jumpItems,
      ],
    },
    {
      label: "Window",
      submenu: [
        { label: "Show Blob", click: () => summonWindow() },
        { label: "Move to Next Display", click: () => moveToNextDisplay() },
      ],
    },
  ];
  if (!isMac) {
    template.unshift({
      label: app.name,
      submenu: [{ role: "quit" }],
    });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
