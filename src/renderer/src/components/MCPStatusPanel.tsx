import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check, Play, Square, X } from "lucide-react";
import type { MCPStatus } from "../types/electron.d";

interface MCPStatusPanelProps {
  onClose: () => void;
  onStatusChange: (running: boolean, port: number) => void;
}

export function MCPStatusPanel({ onClose, onStatusChange }: MCPStatusPanelProps) {
  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [portInput, setPortInput] = useState("3100");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await window.electronAPI.mcpStatus();
      setStatus(s);
      onStatusChange(s.running, s.port);
      if (!s.running) {
        setPortInput((prev) => {
          // ポート入力中は上書きしない (running でないときのみ同期)
          const parsed = parseInt(prev, 10);
          const samePort = !isNaN(parsed) && parsed === s.port;
          return samePort ? prev : String(s.port);
        });
      }
    } catch {
      // ignore — main process may not be ready yet
    }
  }, [onStatusChange]);

  // ポーリング: 2.5秒ごと
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // click-outside で閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleStart = useCallback(async () => {
    const parsed = parseInt(portInput, 10);
    const validPort =
      !isNaN(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : 3100;
    setIsStarting(true);
    try {
      await window.electronAPI.mcpStart(validPort);
      await fetchStatus();
    } catch (err) {
      alert(`MCPサーバーの起動に失敗しました: ${err}`);
    } finally {
      setIsStarting(false);
    }
  }, [portInput, fetchStatus]);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await window.electronAPI.mcpStop();
      await fetchStatus();
    } catch (err) {
      alert(`MCPサーバーの停止に失敗しました: ${err}`);
    } finally {
      setIsStopping(false);
    }
  }, [fetchStatus]);

  const mcpUrl = status
    ? `http://localhost:${status.port}/mcp`
    : "";

  const handleCopy = useCallback(async () => {
    if (!mcpUrl) return;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [mcpUrl]);

  const running = status?.running ?? false;

  return (
    <div ref={panelRef} className="mcp-panel">
      <div className="mcp-panel-header">
        <div className="mcp-panel-title">
          <span className={`mcp-status-dot ${running ? "mcp-status-dot--running" : ""}`} />
          <span>MCP Canvas Server</span>
        </div>
        <button className="mcp-panel-close" onClick={onClose} aria-label="閉じる">
          <X size={14} />
        </button>
      </div>

      <div className="mcp-panel-body">
        {/* ステータス */}
        <div className="mcp-field-row">
          <span className="mcp-label">ステータス</span>
          <span className={`mcp-status-text ${running ? "mcp-status-text--running" : "mcp-status-text--stopped"}`}>
            {running ? "稼働中" : "停止中"}
          </span>
        </div>

        {/* ポート */}
        <div className="mcp-field-row">
          <span className="mcp-label">ポート</span>
          <input
            type="number"
            className="mcp-port-input"
            value={portInput}
            min={1}
            max={65535}
            disabled={running}
            onChange={(e) => setPortInput(e.target.value)}
          />
        </div>

        {/* MCP URL (稼働中のみ) */}
        {running && (
          <div className="mcp-field-col">
            <span className="mcp-label">MCP URL</span>
            <div className="mcp-url-row">
              <span className="mcp-url">{mcpUrl}</span>
              <button
                className="mcp-copy-button"
                onClick={handleCopy}
                title="URLをコピー"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* 接続クライアント数 (稼働中のみ) */}
        {running && (
          <div className="mcp-field-row">
            <span className="mcp-label">接続クライアント</span>
            <span className="mcp-client-count">{status?.clients ?? 0}</span>
          </div>
        )}

        {/* 起動 / 停止ボタン */}
        <div className="mcp-action-row">
          {running ? (
            <button
              className="mcp-button mcp-button--stop"
              onClick={handleStop}
              disabled={isStopping}
            >
              <Square size={14} />
              {isStopping ? "停止中..." : "停止"}
            </button>
          ) : (
            <button
              className="mcp-button mcp-button--start"
              onClick={handleStart}
              disabled={isStarting}
            >
              <Play size={14} />
              {isStarting ? "起動中..." : "起動"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
