import { BrowserView, Utils } from "electrobun/bun";
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
import type { Settings } from "./settings";
import { CanvasServer } from "./mcp/canvas-server";
import { MCPProcessManager } from "./mcp/mcp-process";
import type { AppRPC } from "./rpc";

export interface ServerContext {
  canvasServer: CanvasServer | null;
  mcpProcess: MCPProcessManager | null;
}

export function createRpcHandlers(serverCtx: ServerContext) {
  return BrowserView.defineRPC<AppRPC>({
    handlers: {
      requests: {
        listDir: async ({ path }) => {
          return listDir(path);
        },

        createFolder: async ({ path }) => {
          return createFolder(path);
        },

        createCanvas: async ({ path }) => {
          return createCanvas(path);
        },

        deleteItem: async ({ path }) => {
          return deleteItem(path);
        },

        renameItem: async ({ oldPath, newPath }) => {
          return renameItem(oldPath, newPath);
        },

        readCanvas: async ({ path }) => {
          return readCanvas(path);
        },

        saveCanvas: async ({ path, content }) => {
          return saveCanvas(path, content);
        },

        copyCanvas: async ({ sourcePath, destPath }) => {
          return copyCanvas(sourcePath, destPath);
        },

        getBaseDirectory: async () => {
          return getBaseDirectory();
        },

        trashItem: async ({ path }) => {
          return trashItem(path);
        },

        listTrash: async () => {
          return listTrash();
        },

        restoreItem: async ({ trashPath }) => {
          return restoreItem(trashPath);
        },

        deletePermanently: async ({ trashPath }) => {
          return deletePermanently(trashPath);
        },

        emptyTrash: async () => {
          return emptyTrash();
        },

        setItemIcon: async ({ path, icon, color }) => {
          return setItemIcon(path, icon, color);
        },

        showOpenDialog: async () => {
          const paths = await Utils.openFileDialog({
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          return paths.length > 0 ? paths[0] : null;
        },

        loadSettings: async () => {
          return loadSettings();
        },

        saveSettings: async ({ settings }) => {
          return saveSettings(settings as Settings);
        },

        mcpStart: async ({ port }) => {
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
        },

        mcpStop: async () => {
          if (serverCtx.mcpProcess) {
            await serverCtx.mcpProcess.stop();
            serverCtx.mcpProcess = null;
          }
          if (serverCtx.canvasServer) {
            await serverCtx.canvasServer.stop();
            serverCtx.canvasServer = null;
          }

          const settings = await loadSettings();
          await saveSettings({
            mcp: { enabled: false, port: settings.mcp?.port ?? 3100 },
          });

          console.log("MCP server stopped");
          return { success: true };
        },

        mcpStatus: async () => {
          const running = serverCtx.canvasServer !== null;
          const port = serverCtx.canvasServer?.getPort() ?? 3100;
          const clients = serverCtx.canvasServer?.getClientCount() ?? 0;
          const stdioRunning = serverCtx.mcpProcess?.isRunning() ?? false;
          const mcpServerPath =
            serverCtx.mcpProcess?.resolveMcpServerPath() ?? null;
          return { running, port, clients, stdioRunning, mcpServerPath };
        },
      },

      messages: {},
    },
  });
}
