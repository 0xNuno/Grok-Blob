import { app, ipcMain } from "electron";

app.setName("Blob");

if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void boot();
}

async function boot(): Promise<void> {
  const { Ipc } = await import("../shared/ipc");
  const { createTray } = await import("./tray");
  const { registerHotkey, unregisterHotkey } = await import("./hotkey");
  const { installAppMenu } = await import("./menu");
  const { createWindow, getWindow, hideWindow, summonWindow, setActivityPanel, setPanelWidth, handleChromeDrag } = await import("./window");
  const session = await import("./session");
  const activity = await import("./activity");
  const mine = await import("./mine");
  const { DEFAULT_GATEWAY_URL } = await import("../shared/types");

  app.on("second-instance", () => summonWindow());
  app.on("window-all-closed", () => {
    // Overlay lives in the tray; hiding the sheet must not quit.
  });
  app.on("will-quit", () => unregisterHotkey());
  app.on("activate", () => summonWindow());

  await app.whenReady();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  const { importEnvSettings } = await import("./env");
  importEnvSettings();

  installAppMenu();
  createTray();
  registerHotkey();

  ipcMain.handle(Ipc.bootstrap, async () => session.snapshot());
  ipcMain.handle(Ipc.saveSettings, async (_evt, input: { gatewayUrl?: string; token?: string }) => {
    const gatewayUrl =
      typeof input?.gatewayUrl === "string" && input.gatewayUrl.trim().length > 0
        ? input.gatewayUrl
        : DEFAULT_GATEWAY_URL;
    const token = typeof input?.token === "string" ? input.token : undefined;
    return session.persistSettings({ gatewayUrl, token });
  });
  ipcMain.handle(Ipc.listAgents, async () => session.reloadTranscript());
  ipcMain.handle(Ipc.selectAgent, async (_evt, id: string) => session.chooseAgent(String(id)));
  ipcMain.handle(Ipc.sendPrompt, async (_evt, prompt: string, replyToId?: unknown) =>
    session.sendPrompt(String(prompt ?? ""), typeof replyToId === "string" ? replyToId : undefined),
  );
  ipcMain.handle(Ipc.loadTranscript, async () => session.reloadTranscript());
  ipcMain.handle(Ipc.reactToMessage, async (_evt, input: { entryId?: unknown; emoji?: unknown }) =>
    session.reactToMessage(String(input?.entryId ?? ""), String(input?.emoji ?? "")),
  );
  ipcMain.handle(Ipc.respondToWidget, async (_evt, input: { entryId?: unknown; value?: unknown }) =>
    session.respondToWidget(String(input?.entryId ?? ""), String(input?.value ?? "")),
  );
  ipcMain.handle(Ipc.dismissWidget, async (_evt, entryId: unknown) =>
    session.dismissWidget(String(entryId ?? "")),
  );
  ipcMain.handle(
    Ipc.resolveGate,
    async (
      _evt,
      input: { entryId?: unknown; requestId?: unknown; gate?: unknown; approved?: unknown },
    ) =>
      session.resolveGate(
        String(input?.entryId ?? ""),
        String(input?.requestId ?? ""),
        input?.gate === "local-tool" ? "local-tool" : "auto-review",
        input?.approved === true,
      ),
  );
  ipcMain.handle(Ipc.hide, async () => {
    hideWindow();
    return session.snapshot();
  });
  ipcMain.handle(Ipc.openSettings, async () => session.showSettings());
  ipcMain.handle(Ipc.sync, async () => session.syncWithHost());
  ipcMain.handle(Ipc.refreshRoster, async () => session.refreshRosterOnly());
  ipcMain.handle(Ipc.getActivity, async () => activity.readActivity());
  ipcMain.handle(Ipc.setActivityTasks, async (_evt, tasks: unknown) => activity.setActivityTasks(tasks));
  ipcMain.handle(Ipc.dismissActivityTask, async (_evt, id: unknown) => activity.dismissActivityTask(id));
  ipcMain.handle(Ipc.getMineTasks, async () => mine.readMineTasks());
  ipcMain.handle(Ipc.setMineTasks, async (_evt, tasks: unknown) => mine.setMineTasks(tasks));
  ipcMain.handle(Ipc.dismissMineTask, async (_evt, id: unknown) => mine.dismissMineTask(id));
  ipcMain.handle(Ipc.addMineTask, async (_evt, title: unknown) => mine.addMineTask(title));
  ipcMain.handle(Ipc.setPanelOpen, async (_evt, open: unknown) => {
    setActivityPanel(open === true);
    return session.snapshot();
  });
  ipcMain.handle(Ipc.setPanelWidth, async (_evt, width: unknown) => {
    setPanelWidth(width);
    return session.snapshot();
  });
  ipcMain.handle(Ipc.capture, async (_evt, mode: unknown) =>
    session.captureSheet(mode === "screen" ? "screen" : "region"),
  );
  ipcMain.handle(Ipc.attachClipboard, async () => session.attachClipboardImage());
  ipcMain.handle(Ipc.removeAttachment, async (_evt, id: unknown) => session.dropAttachment(String(id ?? "")));
  ipcMain.handle(Ipc.openScreenRecording, async () => {
    const { openScreenRecordingSettings } = await import("./attachments");
    openScreenRecordingSettings();
    return session.snapshot();
  });
  ipcMain.on(Ipc.chromeDrag, (evt, payload: unknown) => {
    const w = getWindow();
    if (!w || evt.sender !== w.webContents) return;
    handleChromeDrag(payload);
  });

  await session.bootSession();
  createWindow();
  summonWindow();
}
