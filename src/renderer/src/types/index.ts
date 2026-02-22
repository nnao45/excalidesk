import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types/types";

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

export interface ContextMenuState {
  x: number;
  y: number;
  item: FileItem | null;
  parentPath: string;
}

export type CanvasData = ExcalidrawInitialDataState;
