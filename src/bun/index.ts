import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import * as fs from "fs";
import { createRpcHandlers, ServerContext } from "./ipc-handlers";
import { resolveBaseDir, resolveTrashDir } from "./fs-commands";
import { CanvasServer } from "./mcp/canvas-server";
import { MCPProcessManager } from "./mcp/mcp-process";
import { loadSettings } from "./settings";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const serverCtx: ServerContext = {
  canvasServer: null,
  mcpProcess: null,
};

// Ensure canvases and trash directories exist
const canvasesDir = resolveBaseDir();
const trashDir = resolveTrashDir();
fs.mkdirSync(canvasesDir, { recursive: true });
fs.mkdirSync(trashDir, { recursive: true });

// Start MCP server if enabled in settings
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

// Determine URL: use Vite dev server during development, else views://
async function getAppUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel().catch(() => "");
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD", signal: AbortSignal.timeout(500) });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log("Vite dev server not running, using bundled views.");
    }
  }
  return "views://mainview/index.html";
}

// Create RPC handlers
const rpc = createRpcHandlers(serverCtx);

// Create main window
const url = await getAppUrl();

const mainWindow = new BrowserWindow({
  title: "excalidesk",
  url,
  frame: {
    width: 1280,
    height: 800,
    x: 100,
    y: 100,
  },
  rpc,
});

mainWindow.on("close", async () => {
  // Cleanup MCP resources
  if (serverCtx.mcpProcess) {
    await serverCtx.mcpProcess.stop();
  }
  if (serverCtx.canvasServer) {
    await serverCtx.canvasServer.stop();
  }
  Utils.quit();
});

console.log("excalidesk started!");
