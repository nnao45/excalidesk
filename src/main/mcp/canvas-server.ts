import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import type { Server } from "http";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { z } from "zod";
import type { CanvasState, ElementUpdate, WebSocketMessage } from "./types";
import {
  EXCALIDRAW_ELEMENT_TYPES,
  ExcalidrawElementType,
  ServerElement,
  Snapshot,
} from "./excalidraw-types";
import logger from "./logger";
import { Server as MCPServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { tools as MCP_TOOLS, handleToolCall } from "./mcp-server";

interface PendingExport {
  resolve: (data: { format: string; data: string }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingViewport {
  resolve: (data: { success: boolean; message: string }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class CanvasServer {
  private app: express.Application;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private canvasState: CanvasState;
  private clients: Set<WebSocket> = new Set();
  private elements: Map<string, ServerElement> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();
  private pendingExports: Map<string, PendingExport> = new Map();
  private pendingViewports: Map<string, PendingViewport> = new Map();

  constructor(port: number = 3100) {
    this.port = port;
    this.app = express();
    this.canvasState = {
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
        gridSize: null,
      },
      files: {},
    };

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: "50mb" }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", clients: this.clients.size });
    });

    // Get current canvas state
    this.app.get("/canvas", (_req: Request, res: Response) => {
      this.syncCanvasStateFromMap();
      res.json(this.canvasState);
    });

    // Update entire canvas
    this.app.post("/canvas", (req: Request, res: Response) => {
      const { elements, appState, files } = req.body;
      if (elements !== undefined) this.canvasState.elements = elements;
      if (appState !== undefined) this.canvasState.appState = appState;
      if (files !== undefined) this.canvasState.files = files;

      this.syncMapFromCanvasState();
      this.broadcastCanvasSync();

      res.json({ success: true });
    });

    // Get all elements
    this.app.get("/elements", (_req: Request, res: Response) => {
      res.json({ elements: Array.from(this.elements.values()) });
    });

    // Create element
    this.app.post("/elements", (req: Request, res: Response) => {
      const element = req.body as ServerElement;
      if (!element.id) {
        element.id = this.generateId();
      }
      this.elements.set(element.id, element);
      this.broadcastCanvasSync();
      res.json({ success: true, element });
    });

    // Get element by ID
    this.app.get("/elements/:id", (req: Request, res: Response) => {
      const element = this.elements.get(req.params.id);
      if (!element) {
        return res.status(404).json({ error: "Element not found" });
      }
      res.json({ element });
    });

    // Update element
    this.app.put("/elements/:id", (req: Request, res: Response) => {
      const existing = this.elements.get(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Element not found" });
      }

      const updates = req.body as Partial<ExcalidrawElement>;
      this.elements.set(req.params.id, { ...existing, ...(updates as Partial<ServerElement>) });
      this.broadcastCanvasSync();

      res.json({ success: true, element: this.elements.get(req.params.id) });
    });

    // Delete element
    this.app.delete("/elements/:id", (req: Request, res: Response) => {
      if (!this.elements.has(req.params.id)) {
        return res.status(404).json({ error: "Element not found" });
      }

      this.elements.delete(req.params.id);
      this.broadcastCanvasSync();

      res.json({ success: true });
    });

    // Clear canvas
    this.app.post("/clear", (_req: Request, res: Response) => {
      this.elements.clear();
      this.broadcastCanvasSync();

      res.json({ success: true });
    });

    // Get snapshot
    this.app.get("/snapshot", (_req: Request, res: Response) => {
      this.syncCanvasStateFromMap();
      res.json({
        timestamp: Date.now(),
        canvas: this.canvasState,
      });
    });

    // ── MCP-compatible API (from mcp_excalidraw) ────────────────────────────

    const elementTypeEnum = Object.values(EXCALIDRAW_ELEMENT_TYPES) as [
      ExcalidrawElementType,
      ...ExcalidrawElementType[],
    ];

    const CreateElementSchema = z.object({
      id: z.string().optional(),
      type: z.enum(elementTypeEnum),
      x: z.number(),
      y: z.number(),
      width: z.number().optional(),
      height: z.number().optional(),
      backgroundColor: z.string().optional(),
      strokeColor: z.string().optional(),
      strokeWidth: z.number().optional(),
      strokeStyle: z.string().optional(),
      roughness: z.number().optional(),
      opacity: z.number().optional(),
      text: z.string().optional(),
      label: z
        .object({
          text: z.string(),
        })
        .optional(),
      fontSize: z.number().optional(),
      fontFamily: z.string().optional(),
      groupIds: z.array(z.string()).optional(),
      locked: z.boolean().optional(),
      roundness: z
        .object({ type: z.number(), value: z.number().optional() })
        .nullable()
        .optional(),
      fillStyle: z.string().optional(),
      points: z
        .array(
          z.union([
            z.tuple([z.number(), z.number()]),
            z.object({ x: z.number(), y: z.number() }),
          ])
        )
        .optional(),
      start: z.object({ id: z.string() }).optional(),
      end: z.object({ id: z.string() }).optional(),
      startArrowhead: z.string().nullable().optional(),
      endArrowhead: z.string().nullable().optional(),
      elbowed: z.boolean().optional(),
    });

    const UpdateElementSchema = CreateElementSchema.partial().extend({
      id: z.string(),
    });

    this.app.get("/api/elements", (_req: Request, res: Response) => {
      try {
        const elementsArray = Array.from(this.elements.values());
        res.json({
          success: true,
          elements: elementsArray,
          count: elementsArray.length,
        });
      } catch (error) {
        logger.error("Error fetching elements:", error as Error);
        res.status(500).json({
          success: false,
          error: (error as Error).message,
        });
      }
    });

    this.app.post("/api/elements", (req: Request, res: Response) => {
      try {
        const params = CreateElementSchema.parse(req.body);
        const id = params.id || this.generateId();
        const element: ServerElement = {
          id,
          ...params,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        };

        if (
          (element.type === "arrow" || element.type === "line") &&
          ((element as any).start || (element as any).end)
        ) {
          this.resolveArrowBindings([element]);
        }

        this.elements.set(id, element);
        this.broadcast({ type: "element_created", element });
        this.broadcastCanvasSync();

        res.json({
          success: true,
          element,
        });
      } catch (error) {
        logger.error("Error creating element:", error as Error);
        res.status(400).json({
          success: false,
          error: (error as Error).message,
        });
      }
    });

    this.app.put("/api/elements/:id", (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = UpdateElementSchema.parse({ id, ...req.body });

        const existing = this.elements.get(id);
        if (!existing) {
          return res.status(404).json({
            success: false,
            error: `Element with ID ${id} not found`,
          });
        }

        const updated: ServerElement = {
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        this.elements.set(id, updated);
        this.broadcast({ type: "element_updated", element: updated });
        this.broadcastCanvasSync();

        res.json({
          success: true,
          element: updated,
        });
      } catch (error) {
        logger.error("Error updating element:", error as Error);
        res.status(400).json({
          success: false,
          error: (error as Error).message,
        });
      }
    });

    this.app.delete("/api/elements/clear", (_req: Request, res: Response) => {
      this.elements.clear();
      this.broadcast({ type: "canvas_cleared", clearedAt: new Date().toISOString() });
      this.broadcastCanvasSync();
      res.json({ success: true, message: "Canvas cleared" });
    });

    this.app.delete("/api/elements/:id", (req: Request, res: Response) => {
      const { id } = req.params;
      if (!this.elements.has(id)) {
        return res.status(404).json({
          success: false,
          error: `Element with ID ${id} not found`,
        });
      }
      this.elements.delete(id);
      this.broadcast({ type: "element_deleted", elementId: id });
      this.broadcastCanvasSync();
      res.json({ success: true, message: `Element ${id} deleted` });
    });

    this.app.get("/api/elements/search", (req: Request, res: Response) => {
      try {
        const query = req.query;
        const type = query.type as string | undefined;

        const results = Array.from(this.elements.values()).filter((el) => {
          if (type && el.type !== type) return false;
          for (const [key, value] of Object.entries(query)) {
            if (key === "type") continue;
            const elValue = (el as any)[key];
            if (elValue === undefined) return false;
            if (String(elValue) !== String(value)) return false;
          }
          return true;
        });

        res.json({ success: true, elements: results, count: results.length });
      } catch (error) {
        logger.error("Error searching elements:", error as Error);
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.get("/api/elements/:id", (req: Request, res: Response) => {
      const element = this.elements.get(req.params.id);
      if (!element) {
        return res.status(404).json({
          success: false,
          error: `Element with ID ${req.params.id} not found`,
        });
      }
      res.json({ success: true, element });
    });

    this.app.post("/api/elements/batch", (req: Request, res: Response) => {
      try {
        const { elements: elementsToCreate } = req.body as { elements: ServerElement[] };
        if (!Array.isArray(elementsToCreate)) {
          return res.status(400).json({
            success: false,
            error: "elements must be an array",
          });
        }

        const createdElements = elementsToCreate.map((el) => ({
          ...el,
          id: el.id || this.generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        })) as ServerElement[];

        this.resolveArrowBindings(createdElements);

        createdElements.forEach((el) => this.elements.set(el.id, el));
        this.broadcast({ type: "elements_batch_created", elements: createdElements });
        this.broadcastCanvasSync();

        res.json({
          success: true,
          elements: createdElements,
          count: createdElements.length,
        });
      } catch (error) {
        logger.error("Error batch creating elements:", error as Error);
        res.status(400).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.post("/api/elements/from-mermaid", (req: Request, res: Response) => {
      try {
        const { mermaidDiagram, config } = req.body;
        if (!mermaidDiagram || typeof mermaidDiagram !== "string") {
          return res.status(400).json({
            success: false,
            error: "Mermaid diagram definition is required",
          });
        }

        this.broadcast({
          type: "mermaid_convert",
          mermaidDiagram,
          config: config || {},
          timestamp: new Date().toISOString(),
        });

        res.json({
          success: true,
          mermaidDiagram,
          config: config || {},
          message: "Mermaid diagram sent to frontend for conversion.",
        });
      } catch (error) {
        logger.error("Error processing Mermaid diagram:", error as Error);
        res.status(400).json({
          success: false,
          error: (error as Error).message,
        });
      }
    });

    this.app.post("/api/elements/sync", (req: Request, res: Response) => {
      try {
        const { elements: frontendElements, timestamp } = req.body;
        if (!Array.isArray(frontendElements)) {
          return res.status(400).json({
            success: false,
            error: "Expected elements to be an array",
          });
        }

        const beforeCount = this.elements.size;
        this.elements.clear();
        frontendElements.forEach((el: ServerElement) => this.elements.set(el.id, el));
        this.broadcast({ type: "elements_synced", elements: frontendElements, count: frontendElements.length, syncedAt: new Date().toISOString() });
        this.broadcastCanvasSync();

        res.json({
          success: true,
          count: frontendElements.length,
          syncedAt: new Date().toISOString(),
          beforeCount,
          afterCount: this.elements.size,
          timestamp,
        });
      } catch (error) {
        logger.error("Sync error:", error as Error);
        res.status(500).json({
          success: false,
          error: (error as Error).message,
          details: "Internal server error during sync operation",
        });
      }
    });

    this.app.post("/api/export/image", (req: Request, res: Response) => {
      try {
        const { format, background } = req.body;
        if (!format || !["png", "svg"].includes(format)) {
          return res.status(400).json({ success: false, error: 'format must be "png" or "svg"' });
        }
        if (this.clients.size === 0) {
          return res.status(503).json({
            success: false,
            error: "No frontend client connected. Open the canvas first.",
          });
        }

        const requestId = this.generateId();
        const exportPromise = new Promise<{ format: string; data: string }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingExports.delete(requestId);
            reject(new Error("Export timed out after 30 seconds"));
          }, 30000);
          this.pendingExports.set(requestId, { resolve, reject, timeout });
        });

        this.broadcast({
          type: "export_image_request",
          requestId,
          format,
          background: background ?? true,
        });

        exportPromise
          .then((result) => {
            res.json({ success: true, format: result.format, data: result.data });
          })
          .catch((error) => {
            res.status(500).json({ success: false, error: (error as Error).message });
          });
      } catch (error) {
        logger.error("Error initiating image export:", error as Error);
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.post("/api/export/image/result", (req: Request, res: Response) => {
      try {
        const { requestId, format, data, error } = req.body;
        if (!requestId) {
          return res.status(400).json({ success: false, error: "requestId is required" });
        }
        const pending = this.pendingExports.get(requestId);
        if (!pending) {
          return res.json({ success: true });
        }
        if (error) {
          logger.warn(`Export error from one client (requestId=${requestId}): ${error}`);
          return res.json({ success: true });
        }

        clearTimeout(pending.timeout);
        this.pendingExports.delete(requestId);
        pending.resolve({ format, data });
        res.json({ success: true });
      } catch (error) {
        logger.error("Error processing export result:", error as Error);
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.post("/api/viewport", (req: Request, res: Response) => {
      try {
        const { scrollToContent, scrollToElementId, zoom, offsetX, offsetY } = req.body;
        if (this.clients.size === 0) {
          return res.status(503).json({
            success: false,
            error: "No frontend client connected. Open the canvas first.",
          });
        }

        const requestId = this.generateId();
        const viewportPromise = new Promise<{ success: boolean; message: string }>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingViewports.delete(requestId);
            reject(new Error("Viewport request timed out after 10 seconds"));
          }, 10000);
          this.pendingViewports.set(requestId, { resolve, reject, timeout });
        });

        this.broadcast({
          type: "set_viewport",
          requestId,
          scrollToContent,
          scrollToElementId,
          zoom,
          offsetX,
          offsetY,
        });

        viewportPromise
          .then((result) => {
            res.json({ success: true, message: result.message });
          })
          .catch((error) => {
            res.status(500).json({ success: false, error: (error as Error).message });
          });
      } catch (error) {
        logger.error("Error initiating viewport update:", error as Error);
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.post("/api/viewport/result", (req: Request, res: Response) => {
      try {
        const { requestId, success, message, error } = req.body;
        if (!requestId) {
          return res.status(400).json({ success: false, error: "requestId is required" });
        }
        const pending = this.pendingViewports.get(requestId);
        if (!pending) {
          return res.json({ success: true });
        }
        if (error) {
          logger.warn(`Viewport error from one client (requestId=${requestId}): ${error}`);
          return res.json({ success: true });
        }

        clearTimeout(pending.timeout);
        this.pendingViewports.delete(requestId);
        pending.resolve({ success: success ?? true, message: message ?? "Viewport updated" });
        res.json({ success: true });
      } catch (error) {
        logger.error("Error processing viewport result:", error as Error);
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.post("/api/snapshots", (_req: Request, res: Response) => {
      try {
        const name = String((_req.body?.name ?? "").trim());
        if (!name) {
          return res.status(400).json({ success: false, error: "Snapshot name is required" });
        }

        const snapshot: Snapshot = {
          name,
          elements: Array.from(this.elements.values()),
          createdAt: new Date().toISOString(),
        };
        this.snapshots.set(name, snapshot);
        res.json({ success: true, name, elementCount: snapshot.elements.length });
      } catch (error) {
        logger.error("Error creating snapshot:", error as Error);
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    this.app.get("/api/snapshots", (_req: Request, res: Response) => {
      const list = Array.from(this.snapshots.values()).map((s) => ({
        name: s.name,
        createdAt: s.createdAt,
        elementCount: s.elements.length,
      }));
      res.json({ success: true, snapshots: list });
    });

    this.app.get("/api/snapshots/:name", (req: Request, res: Response) => {
      const snapshot = this.snapshots.get(req.params.name);
      if (!snapshot) {
        return res.status(404).json({ success: false, error: "Snapshot not found" });
      }
      res.json({ success: true, snapshot });
    });

    this.app.get("/api/sync/status", (_req: Request, res: Response) => {
      res.json({
        success: true,
        elementCount: this.elements.size,
        timestamp: new Date().toISOString(),
      });
    });

    // MCP HTTP endpoint (Streamable HTTP transport)
    this.setupMCPRoutes();
  }

  private syncMapFromCanvasState(): void {
    this.elements.clear();
    for (const el of this.canvasState.elements as ServerElement[]) {
      if (el && el.id) this.elements.set(el.id, el);
    }
  }

  private syncCanvasStateFromMap(): void {
    this.canvasState.elements = Array.from(this.elements.values());
  }

  private broadcastCanvasSync(exclude?: WebSocket): void {
    this.syncCanvasStateFromMap();
    this.broadcast({ type: "canvas_sync", data: this.canvasState }, exclude);
  }

  // ── Internal canvas operations (used by MCP tools) ────────────────────────

  private generateId(): string {
    return randomUUID().replace(/-/g, "").substring(0, 20);
  }

  private versionFields() {
    return {
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      updated: Date.now(),
    };
  }

  private addElement(element: ExcalidrawElement): void {
    const serverElement = element as ServerElement;
    this.elements.set(serverElement.id, serverElement);
    this.broadcastCanvasSync();
  }

  private updateElementById(
    id: string,
    updates: Partial<ExcalidrawElement>
  ): boolean {
    const existing = this.elements.get(id);
    if (!existing) return false;
    this.elements.set(id, { ...existing, ...(updates as Partial<ServerElement>) });
    this.broadcastCanvasSync();
    return true;
  }

  private deleteElementById(id: string): boolean {
    if (!this.elements.has(id)) return false;
    this.elements.delete(id);
    this.broadcastCanvasSync();
    return true;
  }

  private buildBaseElement(
    type: string,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      id: this.generateId(),
      type,
      x: Number(args.x ?? 100),
      y: Number(args.y ?? 100),
      width: Number(args.width ?? 200),
      height: Number(args.height ?? 100),
      angle: 0,
      strokeColor: args.strokeColor ?? "#1e1e2e",
      backgroundColor: args.backgroundColor ?? "transparent",
      fillStyle: args.fillStyle ?? "hachure",
      strokeWidth: Number(args.strokeWidth ?? 2),
      strokeStyle: args.strokeStyle ?? "solid",
      roughness: Number(args.roughness ?? 1),
      opacity: Number(args.opacity ?? 100),
      groupIds: [],
      roundness: null,
      isDeleted: false,
      link: null,
      locked: false,
      boundElements: null,
      ...this.versionFields(),
    };
  }

  private computeEdgePoint(
    el: ServerElement,
    targetX: number,
    targetY: number
  ): { x: number; y: number } {
    const cx = el.x + (el.width || 0) / 2;
    const cy = el.y + (el.height || 0) / 2;
    const dx = targetX - cx;
    const dy = targetY - cy;

    if (el.type === "diamond") {
      const hw = (el.width || 0) / 2;
      const hh = (el.height || 0) / 2;
      if (dx === 0 && dy === 0) return { x: cx, y: cy + hh };
      const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
      return { x: cx + dx * scale, y: cy + dy * scale };
    }

    if (el.type === "ellipse") {
      const a = (el.width || 0) / 2;
      const b = (el.height || 0) / 2;
      if (dx === 0 && dy === 0) return { x: cx, y: cy + b };
      const angle = Math.atan2(dy, dx);
      return { x: cx + a * Math.cos(angle), y: cy + b * Math.sin(angle) };
    }

    const hw = (el.width || 0) / 2;
    const hh = (el.height || 0) / 2;
    if (dx === 0 && dy === 0) return { x: cx, y: cy + hh };
    const angle = Math.atan2(dy, dx);
    const tanA = Math.tan(angle);
    if (Math.abs(tanA * hw) <= hh) {
      const signX = dx >= 0 ? 1 : -1;
      return { x: cx + signX * hw, y: cy + signX * hw * tanA };
    }
    const signY = dy >= 0 ? 1 : -1;
    return { x: cx + (signY * hh) / tanA, y: cy + signY * hh };
  }

  private resolveArrowBindings(batchElements: ServerElement[]): void {
    const elementMap = new Map<string, ServerElement>();
    batchElements.forEach((el) => elementMap.set(el.id, el));
    this.elements.forEach((el, id) => {
      if (!elementMap.has(id)) elementMap.set(id, el);
    });

    for (const el of batchElements) {
      if (el.type !== "arrow" && el.type !== "line") continue;
      const startRef = (el as any).start as { id: string } | undefined;
      const endRef = (el as any).end as { id: string } | undefined;
      if (!startRef && !endRef) continue;

      const startEl = startRef ? elementMap.get(startRef.id) : undefined;
      const endEl = endRef ? elementMap.get(endRef.id) : undefined;

      const startCenter = startEl
        ? {
            x: startEl.x + (startEl.width || 0) / 2,
            y: startEl.y + (startEl.height || 0) / 2,
          }
        : { x: el.x, y: el.y };
      const endCenter = endEl
        ? {
            x: endEl.x + (endEl.width || 0) / 2,
            y: endEl.y + (endEl.height || 0) / 2,
          }
        : { x: el.x + 100, y: el.y };

      const GAP = 8;
      const startPt = startEl
        ? this.computeEdgePoint(startEl, endCenter.x, endCenter.y)
        : startCenter;
      const endPt = endEl
        ? this.computeEdgePoint(endEl, startCenter.x, startCenter.y)
        : endCenter;

      const startDx = endPt.x - startPt.x;
      const startDy = endPt.y - startPt.y;
      const startDist = Math.sqrt(startDx * startDx + startDy * startDy) || 1;
      const endDx = startPt.x - endPt.x;
      const endDy = startPt.y - endPt.y;
      const endDist = Math.sqrt(endDx * endDx + endDy * endDy) || 1;

      const finalStart = {
        x: startPt.x + (startDx / startDist) * GAP,
        y: startPt.y + (startDy / startDist) * GAP,
      };
      const finalEnd = {
        x: endPt.x + (endDx / endDist) * GAP,
        y: endPt.y + (endDy / endDist) * GAP,
      };

      el.x = finalStart.x;
      el.y = finalStart.y;
      el.points = [
        [0, 0],
        [finalEnd.x - finalStart.x, finalEnd.y - finalStart.y],
      ];

      delete (el as any).start;
      delete (el as any).end;

      if (startEl) {
        (el as any).startBinding = {
          elementId: startEl.id,
          focus: 0,
          gap: GAP,
        };
      }
      if (endEl) {
        (el as any).endBinding = {
          elementId: endEl.id,
          focus: 0,
          gap: GAP,
        };
      }
    }
  }

  private createMCPServer(): MCPServer {
    const server = new MCPServer(
      { name: "excalidesk", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: MCP_TOOLS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return handleToolCall(name, args);
    });

    return server;
  }

  private setupMCPRoutes(): void {
    // MCP Streamable HTTP endpoint — stateless mode for simplicity
    this.app.all("/mcp", express.json(), async (req: Request, res: Response) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      const mcpServer = this.createMCPServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      await mcpServer.close();
    });
  }

  private broadcast(message: WebSocketMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`Canvas Server listening on port ${this.port}`);

          // Setup WebSocket server
          this.wss = new WebSocketServer({ server: this.server! });

          this.wss.on("connection", (ws: WebSocket) => {
            console.log("WebSocket client connected");
            this.clients.add(ws);

            // Send current elements and sync status to new client
            ws.send(
              JSON.stringify({
                type: "initial_elements",
                elements: Array.from(this.elements.values()),
              })
            );
            ws.send(
              JSON.stringify({
                type: "sync_status",
                elementCount: this.elements.size,
                timestamp: new Date().toISOString(),
              })
            );

            // Send full canvas state to new client
            this.syncCanvasStateFromMap();
            ws.send(
              JSON.stringify({
                type: "canvas_sync",
                data: this.canvasState,
              })
            );

            ws.on("message", (data: Buffer) => {
              try {
                const message = JSON.parse(data.toString()) as WebSocketMessage;
                this.handleWebSocketMessage(ws, message);
              } catch (err) {
                console.error("WebSocket message error:", err);
              }
            });

            ws.on("close", () => {
              console.log("WebSocket client disconnected");
              this.clients.delete(ws);
            });

            ws.on("error", (err) => {
              console.error("WebSocket error:", err);
              this.clients.delete(ws);
            });
          });

          resolve();
        });

        this.server.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleWebSocketMessage(
    ws: WebSocket,
    message: WebSocketMessage
  ): void {
    switch (message.type) {
      case "canvas_sync":
        if (message.data) {
          const { elements, appState, files } = message.data as CanvasState;
          if (elements !== undefined) this.canvasState.elements = elements;
          if (appState !== undefined) this.canvasState.appState = appState;
          if (files !== undefined) this.canvasState.files = files;
          if (elements !== undefined) this.syncMapFromCanvasState();
          // Exclude sender to prevent echo loop
          this.broadcast({ type: "canvas_sync", data: this.canvasState }, ws);
        }
        break;

      case "element_created":
        if (message.data) {
          const element = message.data as ServerElement;
          this.elements.set(element.id, element);
          this.broadcastCanvasSync(ws);
        }
        break;

      case "element_updated":
        if (message.data) {
          const { id, updates } = message.data as ElementUpdate;
          const existing = this.elements.get(id);
          if (existing) {
            this.elements.set(id, { ...existing, ...(updates as Partial<ServerElement>) });
            this.broadcastCanvasSync(ws);
          }
        }
        break;

      case "element_deleted":
        if (message.data && typeof message.data === "object" && "id" in message.data) {
          const { id } = message.data as { id: string };
          if (this.elements.has(id)) {
            this.elements.delete(id);
            this.broadcastCanvasSync(ws);
          }
        }
        break;
    }
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.clients.forEach((client) => client.close());
        this.clients.clear();
        this.wss.close(() => {
          console.log("WebSocket server closed");
        });
      }

      if (this.server) {
        this.server.close(() => {
          console.log("Canvas Server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getClientCount(): number {
    return this.clients.size;
  }
}
