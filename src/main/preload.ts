import { contextBridge, ipcRenderer } from "electron";
import { Ipc } from "../shared/ipc";
import type { ActivityFeed, ActivityTask, MineFeed, SaveSettingsInput, SheetState } from "../shared/types";

export type BlobApi = {
  bootstrap: () => Promise<SheetState>;
  saveSettings: (input: SaveSettingsInput) => Promise<SheetState>;
  listAgents: () => Promise<SheetState>;
  selectAgent: (id: string) => Promise<SheetState>;
  sendPrompt: (prompt: string, replyToId?: string) => Promise<SheetState>;
  loadTranscript: () => Promise<SheetState>;
  reactToMessage: (input: { entryId: string; emoji: string }) => Promise<SheetState>;
  respondToWidget: (input: { entryId: string; value: string }) => Promise<SheetState>;
  dismissWidget: (entryId: string) => Promise<SheetState>;
  resolveGate: (input: {
    entryId: string;
    requestId: string;
    gate: "auto-review" | "local-tool";
    approved: boolean;
  }) => Promise<SheetState>;
  hide: () => Promise<SheetState>;
  openSettings: () => Promise<SheetState>;
  sync: () => Promise<SheetState>;
  refreshRoster: () => Promise<SheetState>;
  getActivity: () => Promise<ActivityFeed>;
  setActivityTasks: (tasks: ActivityTask[]) => Promise<ActivityFeed>;
  dismissActivityTask: (id: string) => Promise<ActivityFeed>;
  getMineTasks: () => Promise<MineFeed>;
  setMineTasks: (tasks: ActivityTask[]) => Promise<MineFeed>;
  dismissMineTask: (id: string) => Promise<MineFeed>;
  addMineTask: (title: string) => Promise<MineFeed>;
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

const api: BlobApi = {
  bootstrap: () => ipcRenderer.invoke(Ipc.bootstrap) as Promise<SheetState>,
  saveSettings: (input) => ipcRenderer.invoke(Ipc.saveSettings, input) as Promise<SheetState>,
  listAgents: () => ipcRenderer.invoke(Ipc.listAgents) as Promise<SheetState>,
  selectAgent: (id) => ipcRenderer.invoke(Ipc.selectAgent, id) as Promise<SheetState>,
  sendPrompt: (prompt, replyToId) =>
    ipcRenderer.invoke(Ipc.sendPrompt, prompt, replyToId) as Promise<SheetState>,
  loadTranscript: () => ipcRenderer.invoke(Ipc.loadTranscript) as Promise<SheetState>,
  reactToMessage: (input) => ipcRenderer.invoke(Ipc.reactToMessage, input) as Promise<SheetState>,
  respondToWidget: (input) => ipcRenderer.invoke(Ipc.respondToWidget, input) as Promise<SheetState>,
  dismissWidget: (entryId) => ipcRenderer.invoke(Ipc.dismissWidget, entryId) as Promise<SheetState>,
  resolveGate: (input) => ipcRenderer.invoke(Ipc.resolveGate, input) as Promise<SheetState>,
  hide: () => ipcRenderer.invoke(Ipc.hide) as Promise<SheetState>,
  openSettings: () => ipcRenderer.invoke(Ipc.openSettings) as Promise<SheetState>,
  sync: () => ipcRenderer.invoke(Ipc.sync) as Promise<SheetState>,
  refreshRoster: () => ipcRenderer.invoke(Ipc.refreshRoster) as Promise<SheetState>,
  getActivity: () => ipcRenderer.invoke(Ipc.getActivity) as Promise<ActivityFeed>,
  setActivityTasks: (tasks) => ipcRenderer.invoke(Ipc.setActivityTasks, tasks) as Promise<ActivityFeed>,
  dismissActivityTask: (id) => ipcRenderer.invoke(Ipc.dismissActivityTask, id) as Promise<ActivityFeed>,
  getMineTasks: () => ipcRenderer.invoke(Ipc.getMineTasks) as Promise<MineFeed>,
  setMineTasks: (tasks) => ipcRenderer.invoke(Ipc.setMineTasks, tasks) as Promise<MineFeed>,
  dismissMineTask: (id) => ipcRenderer.invoke(Ipc.dismissMineTask, id) as Promise<MineFeed>,
  addMineTask: (title) => ipcRenderer.invoke(Ipc.addMineTask, title) as Promise<MineFeed>,
  setPanelOpen: (open) => ipcRenderer.invoke(Ipc.setPanelOpen, open) as Promise<SheetState>,
  setPanelWidth: (width) => ipcRenderer.invoke(Ipc.setPanelWidth, width) as Promise<SheetState>,
  capture: (mode) => ipcRenderer.invoke(Ipc.capture, mode) as Promise<SheetState>,
  attachClipboard: () => ipcRenderer.invoke(Ipc.attachClipboard) as Promise<SheetState>,
  removeAttachment: (id) => ipcRenderer.invoke(Ipc.removeAttachment, id) as Promise<SheetState>,
  openScreenRecording: () => ipcRenderer.invoke(Ipc.openScreenRecording) as Promise<SheetState>,
  chromeDrag: (input) => {
    ipcRenderer.send(Ipc.chromeDrag, input);
  },
  onFocusInput: (handler) => {
    const wrapped = (): void => handler();
    ipcRenderer.on(Ipc.focusInput, wrapped);
    return () => {
      ipcRenderer.removeListener(Ipc.focusInput, wrapped);
    };
  },
  onOpenFind: (handler) => {
    const wrapped = (): void => handler();
    ipcRenderer.on(Ipc.openFind, wrapped);
    return () => {
      ipcRenderer.removeListener(Ipc.openFind, wrapped);
    };
  },
  onOpenPicker: (handler) => {
    const wrapped = (): void => handler();
    ipcRenderer.on(Ipc.openPicker, wrapped);
    return () => {
      ipcRenderer.removeListener(Ipc.openPicker, wrapped);
    };
  },
  onCycleAgent: (handler) => {
    const wrapped = (_evt: unknown, delta: unknown): void => {
      handler(typeof delta === "number" && Number.isFinite(delta) ? delta : 1);
    };
    ipcRenderer.on(Ipc.cycleAgent, wrapped);
    return () => {
      ipcRenderer.removeListener(Ipc.cycleAgent, wrapped);
    };
  },
  onJumpAgent: (handler) => {
    const wrapped = (_evt: unknown, n: unknown): void => {
      handler(typeof n === "number" && Number.isFinite(n) ? n : 1);
    };
    ipcRenderer.on(Ipc.jumpAgent, wrapped);
    return () => {
      ipcRenderer.removeListener(Ipc.jumpAgent, wrapped);
    };
  },
  onState: (handler) => {
    const wrapped = (_evt: unknown, state: SheetState): void => handler(state);
    ipcRenderer.on(Ipc.state, wrapped);
    return () => {
      ipcRenderer.removeListener(Ipc.state, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("blob", api);
