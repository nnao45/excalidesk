import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Mock electron before importing settings
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => ""),
  },
}));

import { app } from "electron";
import { loadSettings, saveSettings, getSettingsPath } from "./settings";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidesk-settings-test-"));
  vi.mocked(app.getPath).mockReturnValue(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────
// getSettingsPath
// ──────────────────────────────────────────────

describe("getSettingsPath", () => {
  it("userData/settings.json のパスを返す", async () => {
    const p = await getSettingsPath();
    expect(p).toBe(path.join(tmpDir, "settings.json"));
  });
});

// ──────────────────────────────────────────────
// loadSettings
// ──────────────────────────────────────────────

describe("loadSettings", () => {
  it("ファイルが存在しない場合はデフォルト設定を返す", async () => {
    const settings = await loadSettings();
    expect(settings).toEqual({ mcp: { enabled: false, port: 3100 } });
  });

  it("有効なJSONがある場合はそれを返す", async () => {
    const stored = { mcp: { enabled: true, port: 4200 } };
    fs.writeFileSync(
      path.join(tmpDir, "settings.json"),
      JSON.stringify(stored)
    );

    const settings = await loadSettings();
    expect(settings.mcp?.enabled).toBe(true);
    expect(settings.mcp?.port).toBe(4200);
  });

  it("無効なJSON (壊れたファイル) の場合はデフォルト設定を返す", async () => {
    fs.writeFileSync(path.join(tmpDir, "settings.json"), "NOT JSON {{{");

    const settings = await loadSettings();
    expect(settings).toEqual({ mcp: { enabled: false, port: 3100 } });
  });

  it("空のファイルの場合はデフォルト設定を返す", async () => {
    fs.writeFileSync(path.join(tmpDir, "settings.json"), "");

    const settings = await loadSettings();
    expect(settings).toEqual({ mcp: { enabled: false, port: 3100 } });
  });

  it("部分的な設定 (mcpキーなし) を読み込める", async () => {
    fs.writeFileSync(path.join(tmpDir, "settings.json"), "{}");

    const settings = await loadSettings();
    expect(settings).toEqual({});
    expect(settings.mcp).toBeUndefined();
  });

  it("追加フィールドが含まれていても読み込める", async () => {
    const stored = {
      mcp: { enabled: false, port: 3100 },
      unknown_future_key: "value",
    };
    fs.writeFileSync(
      path.join(tmpDir, "settings.json"),
      JSON.stringify(stored)
    );

    const settings = await loadSettings();
    expect((settings as Record<string, unknown>).unknown_future_key).toBe("value");
  });
});

// ──────────────────────────────────────────────
// saveSettings
// ──────────────────────────────────────────────

describe("saveSettings", () => {
  it("設定をファイルに保存する", async () => {
    await saveSettings({ mcp: { enabled: true, port: 3200 } });

    const raw = fs.readFileSync(path.join(tmpDir, "settings.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.mcp.enabled).toBe(true);
    expect(parsed.mcp.port).toBe(3200);
  });

  it("既存の設定を上書きする", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "settings.json"),
      JSON.stringify({ mcp: { enabled: false, port: 3100 } })
    );

    await saveSettings({ mcp: { enabled: true, port: 9999 } });

    const raw = fs.readFileSync(path.join(tmpDir, "settings.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.mcp.port).toBe(9999);
  });

  it("保存後にloadSettingsで取得できる (ラウンドトリップ)", async () => {
    const original = { mcp: { enabled: true, port: 5678 } };
    await saveSettings(original);
    const loaded = await loadSettings();

    expect(loaded.mcp?.enabled).toBe(true);
    expect(loaded.mcp?.port).toBe(5678);
  });

  it("pretty-print (インデント付き) でJSONを保存する", async () => {
    await saveSettings({ mcp: { enabled: false, port: 3100 } });

    const raw = fs.readFileSync(path.join(tmpDir, "settings.json"), "utf-8");
    // インデント付きなら改行が含まれる
    expect(raw).toContain("\n");
  });

  it("空のオブジェクトを保存できる", async () => {
    await saveSettings({});

    const raw = fs.readFileSync(path.join(tmpDir, "settings.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({});
  });
});
