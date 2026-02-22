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
   * dev ビルド (out/mcp-server.js) と Electron パッケージ版 (resources/) の両方を探す。
   */
  public resolveMcpServerPath(): string | null {
    if (this.mcpServerPath) return this.mcpServerPath;

    const candidates: string[] = [
      // electron-vite build: out/main/index.js の 2階層上が out/ -> out/mcp-server.js
      path.join(__dirname, "../../mcp-server.js"),
      // 同一ディレクトリ (alternative layout)
      path.join(__dirname, "../mcp-server.js"),
      // Electron production (asar パッケージ外の resources/)
      ...(process.resourcesPath
        ? [path.join(process.resourcesPath, "mcp-server.js")]
        : []),
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
          // mcp-server.js が存在しない場合はスキップ (Canvas Server の Streamable HTTP で代替可能)
          console.log(
            "[MCPProcessManager] mcp-server.js not found. " +
              `Run "npm run build:mcp" to enable stdio transport. ` +
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
    this.process = spawn("node", [serverPath], {
      // stdio: MCP JSON-RPC は stdin/stdout 経由。stderr はログ出力
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CANVAS_SERVER_URL: `http://localhost:${this.canvasServerPort}`,
        ENABLE_CANVAS_SYNC: "true",
        // ANSI カラーコードを無効化 (JSON パースを壊さないため)
        NODE_DISABLE_COLORS: "1",
        NO_COLOR: "1",
      },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      // stdout は MCP JSON-RPC プロトコル用 — 通常は外部クライアントが読む
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
