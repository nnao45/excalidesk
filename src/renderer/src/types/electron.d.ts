import type { FileItem, TrashItem } from "./index";

export interface MCPServerConfig {
  enabled: boolean;
  port: number;
}

export interface Settings {
  mcp?: MCPServerConfig;
}

export interface MCPStatus {
  running: boolean;
  port: number;
  clients: number;
  stdioRunning: boolean;
  mcpServerPath: string | null;
}

export interface MCPStartResult {
  success: boolean;
  port: number;
}

interface ElectronAPI {
  listDir(path?: string): Promise<FileItem[]>;
  createFolder(path: string): Promise<void>;
  createCanvas(path: string): Promise<void>;
  deleteItem(path: string): Promise<void>;
  renameItem(oldPath: string, newPath: string): Promise<void>;
  readCanvas(path: string): Promise<string>;
  saveCanvas(path: string, content: string): Promise<void>;
  copyCanvas(sourcePath: string, destPath: string): Promise<void>;
  getBaseDirectory(): Promise<string>;
  trashItem(path: string): Promise<void>;
  listTrash(): Promise<TrashItem[]>;
  restoreItem(trashPath: string): Promise<void>;
  deletePermanently(trashPath: string): Promise<void>;
  emptyTrash(): Promise<void>;
  setItemIcon(path: string, icon: string, color?: string | null): Promise<void>;
  showOpenDialog(): Promise<string | null>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  mcpStart(port: number): Promise<MCPStartResult>;
  mcpStop(): Promise<{ success: boolean }>;
  mcpStatus(): Promise<MCPStatus>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
