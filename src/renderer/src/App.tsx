import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Pencil, Server } from "lucide-react";
import { FileItem } from "./types";
import { useElectronFS } from "./hooks/useElectronFS";
import { Sidebar } from "./components/Sidebar";
import { MCPStatusPanel } from "./components/MCPStatusPanel";
import { findFileByPath } from "./utils/fileTree";

function App() {
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [mcpPort, setMcpPort] = useState(3100);
  const [isMcpPanelOpen, setIsMcpPanelOpen] = useState(false);
  const { listDir } = useElectronFS();

  const refreshFileTree = useCallback(async () => {
    setIsLoadingTree(true);
    setTreeError(null);
    try {
      const tree = await listDir();
      setFileTree(tree);
      setSelectedFile((prev) =>
        prev === null ? null : findFileByPath(tree, prev.path)
      );
    } catch (err) {
      setTreeError(String(err));
    } finally {
      setIsLoadingTree(false);
    }
  }, [listDir]);

  useEffect(() => {
    refreshFileTree();
  }, [refreshFileTree]);

  const handleSelectFile = useCallback((item: FileItem) => {
    if (!item.isFolder) {
      setSelectedFile(item);
    }
  }, []);

  const handleMcpStatusChange = useCallback(
    (running: boolean, port: number) => {
      setMcpRunning(running);
      setMcpPort(port);
    },
    []
  );

  const handleToggleMcpPanel = useCallback(() => {
    setIsMcpPanelOpen((prev) => !prev);
  }, []);

  const handleCloseMcpPanel = useCallback(() => {
    setIsMcpPanelOpen(false);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo"><Pencil size={20} /></span>
          <span className="app-title">excalidesk</span>
        </div>
        {isLoadingTree && (
          <span className="app-status">読み込み中...</span>
        )}
        {treeError && (
          <span className="app-error">エラー: {treeError}</span>
        )}
        <div className="app-header-right">
          <button
            className={`mcp-trigger-button ${mcpRunning ? "mcp-trigger-button--running" : ""}`}
            onClick={handleToggleMcpPanel}
            title="MCPサーバー"
          >
            <Server size={14} />
            MCP
          </button>
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          fileTree={fileTree}
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          onRefresh={refreshFileTree}
        />
        <main className="app-main">
          <Suspense fallback={<div className="canvas-placeholder">キャンバス読み込み中...</div>}>
            <ExcalidrawCanvas
              selectedFile={selectedFile}
              mcpEnabled={mcpRunning}
              mcpPort={mcpPort}
            />
          </Suspense>
        </main>
      </div>

      {isMcpPanelOpen && (
        <MCPStatusPanel
          onClose={handleCloseMcpPanel}
          onStatusChange={handleMcpStatusChange}
        />
      )}
    </div>
  );
}

export default App;

const ExcalidrawCanvas = lazy(() =>
  import("./components/ExcalidrawCanvas").then((mod) => ({
    default: mod.ExcalidrawCanvas,
  }))
);
