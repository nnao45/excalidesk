import { app, BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";
import { registerIpcHandlers } from "./ipc-handlers";
import { resolveBaseDir, resolveTrashDir } from "./fs-commands";
import { CanvasServer } from "./mcp/canvas-server";
import { MCPProcessManager } from "./mcp/mcp-process";
import { loadSettings } from "./settings";

export interface ServerContext {
  canvasServer: CanvasServer | null;
  mcpProcess: MCPProcessManager | null;
}

const serverCtx: ServerContext = {
  canvasServer: null,
  mcpProcess: null,
};

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
    title: "excalidesk",
  });

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  // Ensure canvases and trash directories exist
  const canvasesDir = resolveBaseDir();
  const trashDir = resolveTrashDir();
  fs.mkdirSync(canvasesDir, { recursive: true });
  fs.mkdirSync(trashDir, { recursive: true });

  // Register IPC handlers
  registerIpcHandlers(serverCtx);

  // Load settings and start MCP server if enabled
  try {
    const settings = await loadSettings();
    if (settings.mcp?.enabled) {
      const port = settings.mcp.port || 3100;
      console.log(`Starting Canvas Server on port ${port}...`);

      serverCtx.canvasServer = new CanvasServer(port);
      await serverCtx.canvasServer.start();

      console.log("Starting MCP Process...");
      serverCtx.mcpProcess = new MCPProcessManager(port);
      await serverCtx.mcpProcess.start();

      console.log("MCP integration ready!");
    } else {
      console.log("MCP server is disabled in settings");
    }
  } catch (err) {
    console.error("Failed to start MCP server:", err);
  }

  // Create window
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  // Cleanup MCP resources
  if (serverCtx.mcpProcess) {
    await serverCtx.mcpProcess.stop();
  }
  if (serverCtx.canvasServer) {
    await serverCtx.canvasServer.stop();
  }
});
