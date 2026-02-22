import { useEffect, useRef, useCallback } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types/types";

interface CanvasState {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
}

interface WebSocketMessage {
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
  [key: string]: unknown;
}

interface UseCanvasSyncOptions {
  enabled: boolean;
  port: number;
  onSync?: (state: CanvasState) => void;
  onExportImageRequest?: (payload: {
    requestId: string;
    format: "png" | "svg";
    background?: boolean;
  }) => void;
  onSetViewport?: (payload: {
    requestId: string;
    scrollToContent?: boolean;
    scrollToElementId?: string;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
  }) => void;
  onMermaidConvert?: (payload: {
    mermaidDiagram: string;
    config?: Record<string, unknown>;
  }) => void;
}

export function useCanvasSync(options: UseCanvasSyncOptions) {
  const { enabled, port, onSync, onExportImageRequest, onSetViewport, onMermaidConvert } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      const ws = new WebSocket(`ws://localhost:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Canvas sync connected");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          switch (message.type) {
            case "canvas_sync":
              if (message.data && onSync) {
                onSync(message.data as CanvasState);
              }
              break;
            case "export_image_request":
              if (onExportImageRequest) {
                onExportImageRequest({
                  requestId: String(message.requestId),
                  format: (message.format as "png" | "svg") ?? "png",
                  background: message.background as boolean | undefined,
                });
              }
              break;
            case "set_viewport":
              if (onSetViewport) {
                onSetViewport({
                  requestId: String(message.requestId),
                  scrollToContent: message.scrollToContent as boolean | undefined,
                  scrollToElementId: message.scrollToElementId as string | undefined,
                  zoom: message.zoom as number | undefined,
                  offsetX: message.offsetX as number | undefined,
                  offsetY: message.offsetY as number | undefined,
                });
              }
              break;
            case "mermaid_convert":
              if (onMermaidConvert) {
                onMermaidConvert({
                  mermaidDiagram: String(message.mermaidDiagram ?? ""),
                  config: (message.config as Record<string, unknown>) ?? {},
                });
              }
              break;

            case "element_created":
              // Handle element created from MCP
              // The onSync callback will handle updating the canvas
              break;

            case "element_updated":
              // Handle element updated from MCP
              break;

            case "element_deleted":
              // Handle element deleted from MCP
              break;
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        console.log("Canvas sync disconnected");
        wsRef.current = null;

        // Attempt to reconnect after 5 seconds
        if (enabled) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };
    } catch (err) {
      console.error("Failed to connect to canvas server:", err);
    }
  }, [enabled, port, onSync, onExportImageRequest, onSetViewport, onMermaidConvert]);

  const sendSync = useCallback((state: CanvasState) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "canvas_sync",
          data: state,
        })
      );
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, connect]);

  return {
    sendSync,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
