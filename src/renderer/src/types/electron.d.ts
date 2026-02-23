// Types for MCP-related functionality
// These mirror the types in src/bun/rpc.ts

export interface MCPStatus {
  running: boolean;
  port: number;
  clients: number;
  stdioRunning: boolean;
  mcpServerPath: string | null;
}

export interface Settings {
  mcp?: {
    enabled: boolean;
    port: number;
  };
}
