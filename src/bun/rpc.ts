import type { RPCSchema } from "electrobun";

// ──────────────────────────────────────────────
// Shared types (mirrored from renderer/src/types)
// ──────────────────────────────────────────────

export interface FileItem {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileItem[];
  icon?: string;
  iconColor?: string;
  modified?: number;
  size?: number;
}

export interface TrashItem {
  name: string;
  trashPath: string;
  originalPath: string;
  isFolder: boolean;
  trashedAt: number;
}

export interface Settings {
  mcp?: {
    enabled: boolean;
    port: number;
  };
}

export interface MCPStatus {
  running: boolean;
  port: number;
  clients: number;
  stdioRunning: boolean;
  mcpServerPath: string | null;
}

// ──────────────────────────────────────────────
// RPC Schema
// ──────────────────────────────────────────────

export type AppRPC = {
  bun: RPCSchema<{
    requests: {
      listDir: { params: { path: string }; response: FileItem[] };
      createFolder: { params: { path: string }; response: void };
      createCanvas: { params: { path: string }; response: void };
      deleteItem: { params: { path: string }; response: void };
      renameItem: { params: { oldPath: string; newPath: string }; response: void };
      readCanvas: { params: { path: string }; response: string };
      saveCanvas: { params: { path: string; content: string }; response: void };
      copyCanvas: { params: { sourcePath: string; destPath: string }; response: void };
      getBaseDirectory: { params: Record<string, never>; response: string };
      trashItem: { params: { path: string }; response: void };
      listTrash: { params: Record<string, never>; response: TrashItem[] };
      restoreItem: { params: { trashPath: string }; response: void };
      deletePermanently: { params: { trashPath: string }; response: void };
      emptyTrash: { params: Record<string, never>; response: void };
      setItemIcon: { params: { path: string; icon: string; color: string | null }; response: void };
      showOpenDialog: { params: Record<string, never>; response: string | null };
      loadSettings: { params: Record<string, never>; response: Settings };
      saveSettings: { params: { settings: Settings }; response: void };
      mcpStart: { params: { port: number }; response: { success: boolean; port: number } };
      mcpStop: { params: Record<string, never>; response: { success: boolean } };
      mcpStatus: { params: Record<string, never>; response: MCPStatus };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: Record<string, never>;
  }>;
};
