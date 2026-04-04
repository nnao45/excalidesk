import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

export class MCPProcessManager {
  private process: ChildProcess | null = null;
  private canvasServerPort: number;
  private restartCount: number = 0;
  private readonly MAX_RESTARTS = 3;
  private isShuttingDown: boolean = false;
  private mcpServerPath: string | null = null;

  constructor(canvasServerPort: number) {
    this.canvasServerPort = canvasServerPort;
  }

  /**
   * mcp-server.js のパスを解決する。
   */
  public resolveMcpServerPath(): string | null {
    if (this.mcpServerPath) return this.mcpServerPath;

    // In Bun/Electrobun, use import.meta.dir instead of __dirname
    const currentDir = typeof import.meta !== "undefined" && import.meta.dir
      ? import.meta.dir
      : __dirname;

    const candidates: string[] = [
      path.join(currentDir, "../../mcp-server.js"),
      path.join(currentDir, "../mcp-server.js"),
      path.join(currentDir, "mcp-server.js"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.mcpServerPath = candidate;
        return candidate;
      }
    }
    return null;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const serverPath = this.resolveMcpServerPath();

        if (!serverPath) {
          console.log(
            "[MCPProcessManager] mcp-server.js not found. " +
              `Run "bun run build:mcp" to enable stdio transport. ` +
              `HTTP transport is available at http://localhost:${this.canvasServerPort}/mcp`
          );
          resolve();
          return;
        }

        console.log(`[MCPProcessManager] Spawning stdio MCP server: ${serverPath}`);
        this.isShuttingDown = false;
        this.restartCount = 0;
        this.spawnProcess(serverPath);

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  private spawnProcess(serverPath: string): void {
    // Use bun to run the server if available, fallback to node
    const runtime = process.versions.bun ? "bun" : "node";

    this.process = spawn(runtime, [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CANVAS_SERVER_URL: `http://localhost:${this.canvasServerPort}`,
        ENABLE_CANVAS_SYNC: "true",
        NODE_DISABLE_COLORS: "1",
        NO_COLOR: "1",
      },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.log(`[MCP stdio stdout] ${text}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.error(`[MCP stdio stderr] ${text}`);
    });

    this.process.on("exit", (code, signal) => {
      console.log(
        `[MCPProcessManager] Process exited (code=${code}, signal=${signal})`
      );
      this.process = null;

      if (!this.isShuttingDown && this.restartCount < this.MAX_RESTARTS) {
        this.restartCount++;
        console.log(
          `[MCPProcessManager] Restarting (attempt ${this.restartCount}/${this.MAX_RESTARTS}) in 2s...`
        );
        setTimeout(() => {
          if (!this.isShuttingDown) {
            this.spawnProcess(serverPath);
          }
        }, 2000);
      } else if (!this.isShuttingDown) {
        console.error(
          `[MCPProcessManager] Max restarts (${this.MAX_RESTARTS}) reached. stdio transport disabled.`
        );
      }
    });

    this.process.on("error", (err) => {
      console.error("[MCPProcessManager] Process error:", err);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.isShuttingDown = true;
      if (this.process) {
        this.process.kill("SIGTERM");
        this.process = null;
      }
      console.log("[MCPProcessManager] Stopped");
      resolve();
    });
  }

  public isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
