import { useEffect, useState, useRef, useCallback } from "react";
import { Pencil, Loader2, File, FileText, Image, Video, Music, Code, Database, Archive, FileJson, Table, BookOpen, Newspaper, Palette, Briefcase, ShoppingCart, Heart, Star, Zap, Trophy, Target, Flag, Bell, Calendar, Clock, Mail, MessageSquare, Phone, User, Users, Home, Building, Globe, Map, Settings, Wrench, Package, Box, Gift, Coffee, Lightbulb, Flame, Sparkles, Folder, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { Excalidraw, exportToCanvas, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { FileItem } from "../types";
import { useElectronFS } from "../hooks/useElectronFS";
import { useCanvasSync } from "../hooks/useCanvasSync";

const iconMap: Record<string, LucideIcon> = {
  File, FileText, Image, Video, Music, Code, Database, Archive, FileJson, Table,
  BookOpen, Newspaper, Palette, Briefcase, Heart, Star, Zap, Trophy, Target, Flag,
  Sparkles, Flame, Bell, Mail, MessageSquare, Phone, Calendar, Clock, Home, Building,
  Globe, Map, User, Users, Settings, Wrench, Package, Box, Gift, ShoppingCart,
  Coffee, Lightbulb, Folder,
};

interface ExcalidrawCanvasProps {
  selectedFile: FileItem | null;
  mcpEnabled?: boolean;
  mcpPort?: number;
}

const DEFAULT_CANVAS_DATA: ExcalidrawInitialDataState = {
  type: "excalidraw",
  version: 2,
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridSize: null,
  },
  files: {},
};

export function ExcalidrawCanvas({ selectedFile, mcpEnabled = false, mcpPort = 3100 }: ExcalidrawCanvasProps) {
  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [canRender, setCanRender] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentFileRef = useRef<string | null>(null);
  const lastDataRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const isSyncingRef = useRef(false);
  const sendSyncRef = useRef<
    (state: { elements: readonly ExcalidrawElement[]; appState: AppState; files: BinaryFiles }) => void
  >(() => {});
  const { readCanvas, saveCanvas } = useElectronFS();

  const sanitizeAppState = useCallback((state: Partial<AppState>) => {
    return {
      viewBackgroundColor: state.viewBackgroundColor ?? "#ffffff",
      gridSize: state.gridSize ?? null,
      scrollX: state.scrollX ?? 0,
      scrollY: state.scrollY ?? 0,
      zoom: state.zoom ?? { value: 1 },
    } as Partial<AppState>;
  }, []);

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPIRef.current = api;
  }, []);

  const { sendSync, isConnected } = useCanvasSync({
    enabled: mcpEnabled,
    port: mcpPort,
    onSync: useCallback((state) => {
      if (!excalidrawAPIRef.current) return;
      isSyncingRef.current = true;
      const nextAppState = sanitizeAppState(state.appState);
      excalidrawAPIRef.current.updateScene({
        elements: state.elements,
        appState: nextAppState,
        commitToHistory: false,
      });
      setTimeout(() => { isSyncingRef.current = false; }, 100);
    }, [sanitizeAppState]),
    onExportImageRequest: useCallback(async ({ requestId, format, background }) => {
      if (!excalidrawAPIRef.current) return;
      try {
        const elements = excalidrawAPIRef.current.getSceneElements();
        const appState = excalidrawAPIRef.current.getAppState();
        const files = excalidrawAPIRef.current.getFiles();

        let data = "";
        if (format === "svg") {
          const svg = await exportToSvg({
            elements,
            appState: {
              ...appState,
              exportBackground: background ?? true,
              viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
            },
            files,
          });
          data = new XMLSerializer().serializeToString(svg);
        } else {
          const canvas = await exportToCanvas({
            elements,
            appState: {
              ...appState,
              exportBackground: background ?? true,
              viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
            },
            files,
          });
          const url = canvas.toDataURL("image/png");
          data = url.split(",")[1] ?? "";
        }

        await fetch(`http://localhost:${mcpPort}/api/export/image/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, format, data }),
        });
      } catch (err) {
        await fetch(`http://localhost:${mcpPort}/api/export/image/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId,
            format,
            error: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    }, [mcpPort]),
    onSetViewport: useCallback(async ({ requestId, scrollToContent, scrollToElementId, zoom, offsetX, offsetY }) => {
      if (!excalidrawAPIRef.current) return;
      try {
        const api = excalidrawAPIRef.current;
        if (scrollToContent) {
          api.scrollToContent();
        } else if (scrollToElementId) {
          const target = api.getSceneElements().find((el) => el.id === scrollToElementId);
          if (target) {
            api.scrollToContent(target, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true, duration: 300 });
          }
        }

        if (zoom !== undefined || offsetX !== undefined || offsetY !== undefined) {
          const appState = api.getAppState();
          api.updateScene({
            appState: {
              ...appState,
              scrollX: offsetX ?? appState.scrollX,
              scrollY: offsetY ?? appState.scrollY,
              zoom: zoom !== undefined ? { value: zoom } : appState.zoom,
            },
            commitToHistory: false,
          });
        }

        await fetch(`http://localhost:${mcpPort}/api/viewport/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, success: true, message: "Viewport updated" }),
        });
      } catch (err) {
        await fetch(`http://localhost:${mcpPort}/api/viewport/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        });
      }
    }, [mcpPort]),
    onMermaidConvert: useCallback(async ({ requestId, mermaidDiagram }) => {
      if (!excalidrawAPIRef.current) return;
      try {
        const result = await parseMermaidToExcalidraw(mermaidDiagram);
        const api = excalidrawAPIRef.current;
        const current = api.getSceneElements();
        const newElements = result.elements ?? [];
        const elements = [...current, ...newElements];
        api.updateScene({
          elements,
          commitToHistory: true,
        });
        const appState = api.getAppState();
        const files = api.getFiles();
        sendSyncRef.current({ elements, appState: sanitizeAppState(appState) as AppState, files });

        // ポーリング機構: 変換結果をサーバーに返す
        if (requestId) {
          await fetch(`http://localhost:${mcpPort}/api/elements/from-mermaid/result`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId, elements: newElements }),
          });
        }
      } catch (err) {
        console.error("Mermaid conversion failed:", err);
        // エラーもサーバーに通知
        if (requestId) {
          await fetch(`http://localhost:${mcpPort}/api/elements/from-mermaid/result`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              error: err instanceof Error ? err.message : String(err),
            }),
          });
        }
      }
    }, [sanitizeAppState, mcpPort]),
  });

  useEffect(() => {
    sendSyncRef.current = sendSync;
  }, [sendSync]);

  const forceSave = useCallback(async () => {
    if (!currentFileRef.current || !lastDataRef.current) return;

    const { elements, appState, files } = lastDataRef.current;
    const data: ExcalidrawInitialDataState = {
      type: "excalidraw",
      version: 2,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        gridSize: appState.gridSize,
      },
      files,
    };

    try {
      await saveCanvas(currentFileRef.current, JSON.stringify(data));
    } catch (err) {
      console.error("保存に失敗しました:", err);
    }
  }, [saveCanvas]);

  useEffect(() => {
    const loadFile = async () => {
      if (!selectedFile) {
        setInitialData(null);
        setLoadError(null);
        setCanRender(false);
        setIsLoading(false);
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      // Start loading immediately
      setIsLoading(true);
      setCanRender(false);

      if (currentFileRef.current && currentFileRef.current !== selectedFile.path) {
        setIsSaving(true);
        await forceSave();
        setIsSaving(false);
      }

      currentFileRef.current = selectedFile.path;
      setLoadError(null);

      try {
        const content = await readCanvas(selectedFile.path);
        // Check if file changed during read
        if (currentFileRef.current !== selectedFile.path) {
          return;
        }

        try {
          const data = JSON.parse(content) as ExcalidrawInitialDataState;
          setInitialData(data);
        } catch {
          setInitialData(DEFAULT_CANVAS_DATA);
        }

        // Only allow rendering after data is set
        setCanRender(true);
      } catch (err) {
        if (currentFileRef.current !== selectedFile.path) {
          return;
        }
        setLoadError(String(err));
        setInitialData(DEFAULT_CANVAS_DATA);
        setCanRender(true);
      } finally {
        if (currentFileRef.current === selectedFile.path) {
          setIsLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [selectedFile?.path, readCanvas, forceSave]);

  const handleChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (!selectedFile) return;

      lastDataRef.current = { elements, appState, files };

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      const filePath = selectedFile.path;
      saveTimerRef.current = setTimeout(async () => {
        if (currentFileRef.current !== filePath) return;

        const data: ExcalidrawInitialDataState = {
          type: "excalidraw",
          version: 2,
          elements,
          appState: {
            viewBackgroundColor:
              appState.viewBackgroundColor ?? "#ffffff",
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            gridSize: appState.gridSize,
          },
          files,
        };

        setIsSaving(true);
        try {
          await saveCanvas(filePath, JSON.stringify(data));
        } catch (err) {
          console.error("保存に失敗しました:", err);
        } finally {
          setIsSaving(false);
        }

        // Sync to Canvas Server (skip if update came from server to avoid echo)
        if (!isSyncingRef.current) {
          sendSync({ elements, appState: sanitizeAppState(appState) as AppState, files });
        }
      }, 1000);
    },
    [selectedFile, saveCanvas, sendSync, sanitizeAppState]
  );

  if (!selectedFile) {
    return (
      <div className="canvas-placeholder">
        <div className="canvas-placeholder-content">
          <div className="canvas-placeholder-icon"><Pencil size={48} /></div>
          <h2>excalidesk</h2>
          <p>左サイドバーからキャンバスを選択するか、</p>
          <p>新しいキャンバスを作成してください。</p>
        </div>
      </div>
    );
  }

  if (isLoading || !canRender) {
    const displayName = selectedFile.name.endsWith(".excalidraw")
      ? selectedFile.name.slice(0, -".excalidraw".length)
      : selectedFile.name;

    const IconComponent = selectedFile.icon && iconMap[selectedFile.icon] ? iconMap[selectedFile.icon] : File;
    const iconColor = selectedFile.iconColor && selectedFile.iconColor !== "default" ? selectedFile.iconColor : undefined;

    return (
      <div className="canvas-container">
        <div className="canvas-toolbar">
          <div className="canvas-filename-container">
            <IconComponent size={16} style={{ color: iconColor }} className="canvas-filename-icon" />
            <span className="canvas-filename">{displayName}</span>
          </div>
          <div className="canvas-toolbar-right">
            {isSaving && (
              <span className="canvas-saving">
                <Loader2 size={14} className="spinner-small" />
                保存中...
              </span>
            )}
          </div>
        </div>
        <div className="canvas-placeholder">
          <div className="canvas-placeholder-content">
            <div className="canvas-loading">
              <Loader2 size={48} className="spinner" />
            </div>
            <p>読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  const displayName = selectedFile.name.endsWith(".excalidraw")
    ? selectedFile.name.slice(0, -".excalidraw".length)
    : selectedFile.name;

  const IconComponent = selectedFile.icon && iconMap[selectedFile.icon] ? iconMap[selectedFile.icon] : File;
  const iconColor = selectedFile.iconColor && selectedFile.iconColor !== "default" ? selectedFile.iconColor : undefined;

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const formatDate = (timestamp: number | undefined) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  };

  return (
    <div className="canvas-container">
      <div className="canvas-toolbar">
        <div className="canvas-filename-container">
          <IconComponent size={16} style={{ color: iconColor }} className="canvas-filename-icon" />
          <span className="canvas-filename">{displayName}</span>
        </div>
        <div className="canvas-toolbar-right">
          {selectedFile.modified && (
            <span className="canvas-metadata">
              最終更新日: {formatDate(selectedFile.modified)}
            </span>
          )}
          {selectedFile.size !== undefined && (
            <span className="canvas-metadata">
              ファイルサイズ: {formatFileSize(selectedFile.size)}
            </span>
          )}
          {loadError && (
            <span className="canvas-error">読み込みエラー: {loadError}</span>
          )}
          {isSaving && (
            <span className="canvas-saving">
              <Loader2 size={14} className="spinner-small" />
              保存中...
            </span>
          )}
          {mcpEnabled && (
            <span className="canvas-mcp-status" title={isConnected ? "MCP Canvas Server 接続中" : "MCP Canvas Server 切断中"}>
              {isConnected ? <Wifi size={14} className="mcp-connected" /> : <WifiOff size={14} className="mcp-disconnected" />}
            </span>
          )}
        </div>
      </div>
      <div className="canvas-excalidraw">
        <Excalidraw
          key={selectedFile.path}
          initialData={initialData ?? DEFAULT_CANVAS_DATA}
          excalidrawAPI={handleExcalidrawAPI}
          onChange={
            handleChange as Parameters<typeof Excalidraw>[0]["onChange"]
          }
          UIOptions={{
            canvasActions: {
              export: false,
              loadScene: false,
            },
          }}
        />
      </div>
    </div>
  );
}
