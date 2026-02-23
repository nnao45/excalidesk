import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";

// Canvas Server types
export interface CanvasState {
  elements: ExcalidrawElement[];
  appState: {
    viewBackgroundColor?: string;
    gridSize?: number | null;
    [key: string]: unknown;
  };
  files: Record<string, unknown>;
}

export interface ElementUpdate {
  id: string;
  updates: Partial<ExcalidrawElement>;
}

export interface WebSocketMessage {
  type:
    | "initial_elements"
    | "element_created"
    | "element_updated"
    | "element_deleted"
    | "elements_batch_created"
    | "elements_synced"
    | "sync_status"
    | "mermaid_convert"
    | "canvas_cleared"
    | "export_image_request"
    | "set_viewport"
    | "canvas_sync"
    | "snapshot";
  data?: unknown;
}

// MCP Server types
export interface MCPServerConfig {
  enabled: boolean;
  port: number;
}

export interface Settings {
  mcp?: MCPServerConfig;
}
