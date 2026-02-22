import { ipcMain, dialog, BrowserWindow } from "electron";
import {
  listDir,
  createFolder,
  createCanvas,
  deleteItem,
  renameItem,
  readCanvas,
  saveCanvas,
  copyCanvas,
  getBaseDirectory,
  trashItem,
  listTrash,
  restoreItem,
  deletePermanently,
  emptyTrash,
  setItemIcon,
} from "./fs-commands";
import { loadSettings, saveSettings } from "./settings";
import type { Settings } from "./mcp/types";
import { CanvasServer } from "./mcp/canvas-server";
import { MCPProcessManager } from "./mcp/mcp-process";
import type { ServerContext } from "./index";

export function registerIpcHandlers(serverCtx: ServerContext): void {
  ipcMain.handle("fs:listDir", async (_event, path: string) => {
    return listDir(path);
  });

  ipcMain.handle("fs:createFolder", async (_event, path: string) => {
    return createFolder(path);
  });

  ipcMain.handle("fs:createCanvas", async (_event, path: string) => {
    return createCanvas(path);
  });

  ipcMain.handle("fs:deleteItem", async (_event, path: string) => {
    return deleteItem(path);
  });

  ipcMain.handle(
    "fs:renameItem",
    async (_event, oldPath: string, newPath: string) => {
      return renameItem(oldPath, newPath);
    }
  );

  ipcMain.handle("fs:readCanvas", async (_event, path: string) => {
    return readCanvas(path);
  });

  ipcMain.handle(
    "fs:saveCanvas",
    async (_event, path: string, content: string) => {
      return saveCanvas(path, content);
    }
  );

  ipcMain.handle(
    "fs:copyCanvas",
    async (_event, sourcePath: string, destPath: string) => {
      return copyCanvas(sourcePath, destPath);
    }
  );

  ipcMain.handle("fs:getBaseDirectory", async () => {
    return getBaseDirectory();
  });

  ipcMain.handle("fs:trashItem", async (_event, path: string) => {
    return trashItem(path);
  });

  ipcMain.handle("fs:listTrash", async () => {
    return listTrash();
  });

  ipcMain.handle("fs:restoreItem", async (_event, trashPath: string) => {
    return restoreItem(trashPath);
  });

  ipcMain.handle("fs:deletePermanently", async (_event, trashPath: string) => {
    return deletePermanently(trashPath);
  });

  ipcMain.handle("fs:emptyTrash", async () => {
    return emptyTrash();
  });

  ipcMain.handle(
    "fs:setItemIcon",
    async (_event, path: string, icon: string, color?: string | null) => {
      return setItemIcon(path, icon, color);
    }
  );

  ipcMain.handle("dialog:openDirectory", async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "保存先フォルダを選択",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Settings handlers
  ipcMain.handle("settings:load", async () => {
    return loadSettings();
  });

  ipcMain.handle("settings:save", async (_event, settings: Settings) => {
    return saveSettings(settings);
  });

  // MCP handlers
  ipcMain.handle("mcp:start", async (_event, port: number) => {
    // Stop existing server if running
    if (serverCtx.mcpProcess) {
      await serverCtx.mcpProcess.stop();
      serverCtx.mcpProcess = null;
    }
    if (serverCtx.canvasServer) {
      await serverCtx.canvasServer.stop();
      serverCtx.canvasServer = null;
    }

    const validPort =
      Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 3100;

    serverCtx.canvasServer = new CanvasServer(validPort);
    await serverCtx.canvasServer.start();

    serverCtx.mcpProcess = new MCPProcessManager(validPort);
    await serverCtx.mcpProcess.start();

    await saveSettings({ mcp: { enabled: true, port: validPort } });

    console.log(`MCP server started on port ${validPort}`);
    return { success: true, port: validPort };
  });

  ipcMain.handle("mcp:stop", async () => {
    if (serverCtx.mcpProcess) {
      await serverCtx.mcpProcess.stop();
      serverCtx.mcpProcess = null;
    }
    if (serverCtx.canvasServer) {
      await serverCtx.canvasServer.stop();
      serverCtx.canvasServer = null;
    }

    // Preserve port in settings but disable
    const settings = await loadSettings();
    await saveSettings({
      mcp: { enabled: false, port: settings.mcp?.port ?? 3100 },
    });

    console.log("MCP server stopped");
    return { success: true };
  });

  ipcMain.handle("mcp:status", async () => {
    const running = serverCtx.canvasServer !== null;
    const port = serverCtx.canvasServer?.getPort() ?? 3100;
    const clients = serverCtx.canvasServer?.getClientCount() ?? 0;
    // stdio MCP server の起動状態と実行パス
    const stdioRunning = serverCtx.mcpProcess?.isRunning() ?? false;
    const mcpServerPath = serverCtx.mcpProcess?.resolveMcpServerPath() ?? null;
    return { running, port, clients, stdioRunning, mcpServerPath };
  });
}
