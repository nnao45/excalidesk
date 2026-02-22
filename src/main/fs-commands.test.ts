import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as os from "os";
import * as path from "path";

// Mock electron app before importing fs-commands
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => ""),
  },
}));

import { app } from "electron";
import {
  safeRelativePath,
  collectItems,
  loadItemIcon,
  listDir,
  createFolder,
  createCanvas,
  deleteItem,
  renameItem,
  readCanvas,
  saveCanvas,
  copyCanvas,
  trashItem,
  listTrash,
  restoreItem,
  deletePermanently,
  emptyTrash,
  setItemIcon,
  getBaseDirectory,
} from "./fs-commands";

let tmpDir: string;
let canvasesDir: string;
let trashDir: string;

function makeFile(dir: string, name: string, content = "dummy"): void {
  fs.writeFileSync(path.join(dir, name), content);
}

function makeDir(dir: string, name: string): string {
  const p = path.join(dir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidesk-test-"));
  canvasesDir = path.join(tmpDir, "canvases");
  trashDir = path.join(tmpDir, "trash");
  fs.mkdirSync(canvasesDir, { recursive: true });
  fs.mkdirSync(trashDir, { recursive: true });

  // Mock app.getPath to return our temp directory
  vi.mocked(app.getPath).mockReturnValue(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────
// safeRelativePath のテスト
// ──────────────────────────────────────────────

describe("safeRelativePath", () => {
  it("空文字は許可する", () => {
    expect(() => safeRelativePath("")).not.toThrow();
  });

  it("通常のファイル名は許可する", () => {
    expect(() => safeRelativePath("test.excalidraw")).not.toThrow();
  });

  it("ネストパスは許可する", () => {
    expect(() => safeRelativePath("folder/test.excalidraw")).not.toThrow();
  });

  it("深くネストされたパスは許可する", () => {
    expect(() =>
      safeRelativePath("a/b/c/d/test.excalidraw")
    ).not.toThrow();
  });

  it("親ディレクトリ参照を拒否する", () => {
    expect(() => safeRelativePath("../secret")).toThrow("パストラバーサル");
  });

  it("中間の親ディレクトリ参照を拒否する", () => {
    expect(() => safeRelativePath("folder/../etc/passwd")).toThrow(
      "パストラバーサル"
    );
  });

  it("絶対パスを拒否する", () => {
    expect(() => safeRelativePath("/etc/passwd")).toThrow();
  });

  it("複数の親ディレクトリ参照を拒否する", () => {
    expect(() => safeRelativePath("../../etc/shadow")).toThrow(
      "パストラバーサル"
    );
  });
});

// ──────────────────────────────────────────────
// collectItems のテスト
// ──────────────────────────────────────────────

describe("collectItems", () => {
  it("空ディレクトリは空配列を返す", async () => {
    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toEqual([]);
  });

  it("excalidrawファイルのみ収集する", async () => {
    makeFile(canvasesDir, "canvas.excalidraw");
    makeFile(canvasesDir, "README.md");
    makeFile(canvasesDir, "image.png");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("canvas.excalidraw");
    expect(result[0].isFolder).toBe(false);
  });

  it("ドットで始まるファイルをスキップする", async () => {
    makeFile(canvasesDir, ".hidden.excalidraw");
    makeFile(canvasesDir, "visible.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("visible.excalidraw");
  });

  it("ドットで始まるフォルダをスキップする", async () => {
    makeDir(canvasesDir, ".git");
    makeDir(canvasesDir, "myFolder");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("myFolder");
    expect(result[0].isFolder).toBe(true);
  });

  it("フォルダはファイルより先に並ぶ", async () => {
    makeFile(canvasesDir, "zzz.excalidraw");
    makeDir(canvasesDir, "aaa");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(2);
    expect(result[0].isFolder).toBe(true);
    expect(result[1].isFolder).toBe(false);
  });

  it("同種アイテムはアルファベット順で並ぶ", async () => {
    makeFile(canvasesDir, "zzz.excalidraw");
    makeFile(canvasesDir, "aaa.excalidraw");
    makeFile(canvasesDir, "mmm.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("aaa.excalidraw");
    expect(result[1].name).toBe("mmm.excalidraw");
    expect(result[2].name).toBe("zzz.excalidraw");
  });

  it("アルファベット順は大文字小文字を区別しない", async () => {
    makeFile(canvasesDir, "Banana.excalidraw");
    makeFile(canvasesDir, "apple.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(2);
    expect(result[0].name.toLowerCase()).toBe("apple.excalidraw");
    expect(result[1].name.toLowerCase()).toBe("banana.excalidraw");
  });

  it("フォルダ内のファイルを再帰的に収集する", async () => {
    const sub = makeDir(canvasesDir, "subFolder");
    makeFile(sub, "child.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1);
    expect(result[0].isFolder).toBe(true);
    expect(result[0].name).toBe("subFolder");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe("child.excalidraw");
  });

  it("相対パスはスラッシュ区切りになる", async () => {
    const sub = makeDir(canvasesDir, "folder");
    makeFile(sub, "canvas.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result[0].children![0].path).toBe("folder/canvas.excalidraw");
  });

  it("空のフォルダもchildren空配列で収集する", async () => {
    makeDir(canvasesDir, "emptyFolder");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1);
    expect(result[0].isFolder).toBe(true);
    expect(result[0].name).toBe("emptyFolder");
    expect(result[0].children).toEqual([]);
  });

  it("複数階層の再帰が正しく動く", async () => {
    const a = makeDir(canvasesDir, "a");
    const b = makeDir(a, "b");
    makeFile(b, "deep.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1); // a
    const aChildren = result[0].children!;
    expect(aChildren).toHaveLength(1); // b
    const bChildren = aChildren[0].children!;
    expect(bChildren).toHaveLength(1); // deep.excalidraw
    expect(bChildren[0].name).toBe("deep.excalidraw");
    expect(bChildren[0].path).toBe("a/b/deep.excalidraw");
  });

  it("フォルダとファイルが混在するとき正しくソートする", async () => {
    makeFile(canvasesDir, "z-file.excalidraw");
    makeDir(canvasesDir, "m-folder");
    makeFile(canvasesDir, "a-file.excalidraw");
    makeDir(canvasesDir, "z-folder");

    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(4);
    // folders first, alphabetical
    expect(result[0].name).toBe("m-folder");
    expect(result[0].isFolder).toBe(true);
    expect(result[1].name).toBe("z-folder");
    expect(result[1].isFolder).toBe(true);
    // files second, alphabetical
    expect(result[2].name).toBe("a-file.excalidraw");
    expect(result[2].isFolder).toBe(false);
    expect(result[3].name).toBe("z-file.excalidraw");
    expect(result[3].isFolder).toBe(false);
  });
});

// ──────────────────────────────────────────────
// loadItemIcon のテスト
// ──────────────────────────────────────────────

describe("loadItemIcon", () => {
  it("アイコンファイルがない場合はundefinedを返す", () => {
    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBeUndefined();
    expect(result.iconColor).toBeUndefined();
  });

  it("アイコン名のみの場合はiconColorがundefined", () => {
    const metaDir = makeDir(canvasesDir, ".meta");
    fs.writeFileSync(path.join(metaDir, "test.excalidraw.icon"), "Star");

    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBe("Star");
    expect(result.iconColor).toBeUndefined();
  });

  it("アイコン名と色がある場合は両方返す", () => {
    const metaDir = makeDir(canvasesDir, ".meta");
    fs.writeFileSync(
      path.join(metaDir, "test.excalidraw.icon"),
      "Heart:#f38ba8"
    );

    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBe("Heart");
    expect(result.iconColor).toBe("#f38ba8");
  });
});

// ──────────────────────────────────────────────
// Integration tests (commands using mocked app)
// ──────────────────────────────────────────────

describe("getBaseDirectory", () => {
  it("canvasesディレクトリのパスを返す", async () => {
    const result = await getBaseDirectory();
    expect(result).toBe(canvasesDir);
  });
});

describe("listDir", () => {
  it("空ディレクトリで空配列を返す", async () => {
    const result = await listDir("");
    expect(result).toEqual([]);
  });

  it("ファイルとフォルダをリストする", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    makeDir(canvasesDir, "folder");

    const result = await listDir("");
    expect(result).toHaveLength(2);
    expect(result[0].isFolder).toBe(true);
    expect(result[1].name).toBe("test.excalidraw");
  });

  it("存在しないパスで空配列を返す", async () => {
    const result = await listDir("nonexistent");
    expect(result).toEqual([]);
  });
});

describe("createFolder", () => {
  it("フォルダを作成する", async () => {
    await createFolder("newFolder");
    const stat = fs.statSync(path.join(canvasesDir, "newFolder"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("ネストしたフォルダを作成する", async () => {
    await createFolder("a/b/c");
    const stat = fs.statSync(path.join(canvasesDir, "a/b/c"));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("createCanvas", () => {
  it("デフォルトコンテンツでファイルを作成する", async () => {
    await createCanvas("test.excalidraw");
    const content = fs.readFileSync(
      path.join(canvasesDir, "test.excalidraw"),
      "utf-8"
    );
    const data = JSON.parse(content);
    expect(data.type).toBe("excalidraw");
    expect(data.source).toBe("excalidesk");
    expect(data.elements).toEqual([]);
  });

  it("ネストしたパスでも親ディレクトリを自動作成する", async () => {
    await createCanvas("folder/test.excalidraw");
    expect(
      fs.existsSync(path.join(canvasesDir, "folder/test.excalidraw"))
    ).toBe(true);
  });
});

describe("deleteItem", () => {
  it("ファイルを削除する", async () => {
    makeFile(canvasesDir, "delete-me.excalidraw");
    await deleteItem("delete-me.excalidraw");
    expect(
      fs.existsSync(path.join(canvasesDir, "delete-me.excalidraw"))
    ).toBe(false);
  });

  it("フォルダを再帰的に削除する", async () => {
    const sub = makeDir(canvasesDir, "folder");
    makeFile(sub, "child.excalidraw");
    await deleteItem("folder");
    expect(fs.existsSync(path.join(canvasesDir, "folder"))).toBe(false);
  });
});

describe("renameItem", () => {
  it("ファイルをリネームする", async () => {
    makeFile(canvasesDir, "old.excalidraw");
    await renameItem("old.excalidraw", "new.excalidraw");
    expect(fs.existsSync(path.join(canvasesDir, "old.excalidraw"))).toBe(false);
    expect(fs.existsSync(path.join(canvasesDir, "new.excalidraw"))).toBe(true);
  });

  it("ファイルをフォルダに移動する", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    makeDir(canvasesDir, "folder");
    await renameItem("test.excalidraw", "folder/test.excalidraw");
    expect(
      fs.existsSync(path.join(canvasesDir, "folder/test.excalidraw"))
    ).toBe(true);
  });
});

describe("readCanvas / saveCanvas", () => {
  it("保存して読み込む", async () => {
    const content = '{"type":"excalidraw","elements":[]}';
    await saveCanvas("test.excalidraw", content);
    const result = await readCanvas("test.excalidraw");
    expect(result).toBe(content);
  });

  it("ネストしたパスに保存して読み込む", async () => {
    const content = '{"test":true}';
    await saveCanvas("folder/test.excalidraw", content);
    const result = await readCanvas("folder/test.excalidraw");
    expect(result).toBe(content);
  });
});

describe("copyCanvas", () => {
  it("ファイルをコピーする", async () => {
    makeFile(canvasesDir, "source.excalidraw", "canvas data");
    await copyCanvas("source.excalidraw", "dest.excalidraw");

    expect(fs.existsSync(path.join(canvasesDir, "source.excalidraw"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(canvasesDir, "dest.excalidraw"))).toBe(true);
    expect(
      fs.readFileSync(path.join(canvasesDir, "dest.excalidraw"), "utf-8")
    ).toBe("canvas data");
  });

  it("存在しないソースでエラーになる", async () => {
    await expect(
      copyCanvas("nonexistent.excalidraw", "dest.excalidraw")
    ).rejects.toThrow("Source file does not exist");
  });

  it("既存の宛先でエラーになる", async () => {
    makeFile(canvasesDir, "source.excalidraw");
    makeFile(canvasesDir, "dest.excalidraw");
    await expect(
      copyCanvas("source.excalidraw", "dest.excalidraw")
    ).rejects.toThrow("Destination file already exists");
  });

  it("アイコンメタデータもコピーする", async () => {
    makeFile(canvasesDir, "source.excalidraw");
    const metaDir = makeDir(canvasesDir, ".meta");
    fs.writeFileSync(
      path.join(metaDir, "source.excalidraw.icon"),
      "Star:#f38ba8"
    );

    await copyCanvas("source.excalidraw", "dest.excalidraw");

    const destMeta = fs.readFileSync(
      path.join(metaDir, "dest.excalidraw.icon"),
      "utf-8"
    );
    expect(destMeta).toBe("Star:#f38ba8");
  });
});

describe("trash operations", () => {
  it("ファイルをゴミ箱に移動する", async () => {
    makeFile(canvasesDir, "trash-me.excalidraw");
    await trashItem("trash-me.excalidraw");

    expect(
      fs.existsSync(path.join(canvasesDir, "trash-me.excalidraw"))
    ).toBe(false);

    const trashEntries = fs.readdirSync(trashDir);
    const dataFiles = trashEntries.filter((e) => !e.endsWith(".meta"));
    expect(dataFiles).toHaveLength(1);
    expect(dataFiles[0]).toContain("trash-me.excalidraw");
  });

  it("ゴミ箱をリストする", async () => {
    makeFile(canvasesDir, "item1.excalidraw");
    await trashItem("item1.excalidraw");

    const items = await listTrash();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("item1");
    expect(items[0].originalPath).toBe("item1.excalidraw");
  });

  it("ゴミ箱から復元する", async () => {
    makeFile(canvasesDir, "restore-me.excalidraw");
    await trashItem("restore-me.excalidraw");

    const items = await listTrash();
    expect(items).toHaveLength(1);

    await restoreItem(items[0].trashPath);
    expect(
      fs.existsSync(path.join(canvasesDir, "restore-me.excalidraw"))
    ).toBe(true);

    const itemsAfter = await listTrash();
    expect(itemsAfter).toHaveLength(0);
  });

  it("ゴミ箱から完全削除する", async () => {
    makeFile(canvasesDir, "delete-forever.excalidraw");
    await trashItem("delete-forever.excalidraw");

    const items = await listTrash();
    await deletePermanently(items[0].trashPath);

    const itemsAfter = await listTrash();
    expect(itemsAfter).toHaveLength(0);
  });

  it("ゴミ箱を空にする", async () => {
    makeFile(canvasesDir, "item1.excalidraw");
    makeFile(canvasesDir, "item2.excalidraw");
    await trashItem("item1.excalidraw");
    await trashItem("item2.excalidraw");

    const items = await listTrash();
    expect(items).toHaveLength(2);

    await emptyTrash();
    const itemsAfter = await listTrash();
    expect(itemsAfter).toHaveLength(0);
  });
});

describe("setItemIcon", () => {
  it("アイコン名のみを設定する", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    await setItemIcon("test.excalidraw", "Star");

    const metaPath = path.join(canvasesDir, ".meta", "test.excalidraw.icon");
    expect(fs.readFileSync(metaPath, "utf-8")).toBe("Star");
  });

  it("アイコン名と色を設定する", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    await setItemIcon("test.excalidraw", "Heart", "#f38ba8");

    const metaPath = path.join(canvasesDir, ".meta", "test.excalidraw.icon");
    expect(fs.readFileSync(metaPath, "utf-8")).toBe("Heart:#f38ba8");
  });

  it("設定後にloadItemIconで取得できる", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    await setItemIcon("test.excalidraw", "Zap", "#fab387");

    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBe("Zap");
    expect(result.iconColor).toBe("#fab387");
  });
});

// ═══════════════════════════════════════════════════════════════
// ここから追加エッジケーステスト
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────
// safeRelativePath エッジケース
// ──────────────────────────────────────────────

describe("safeRelativePath - エッジケース", () => {
  it('".." 単体を拒否する', () => {
    expect(() => safeRelativePath("..")).toThrow("パストラバーサル");
  });

  it('"..." (3ドット) は許可する', () => {
    expect(() => safeRelativePath("...")).not.toThrow();
  });

  it('"a/b/../c" (中間複数traversal) を拒否する', () => {
    expect(() => safeRelativePath("a/b/../c")).toThrow("パストラバーサル");
  });

  it('"./file" (カレントディレクトリ参照) は許可する', () => {
    expect(() => safeRelativePath("./file.excalidraw")).not.toThrow();
  });

  it("スペース単体は許可する", () => {
    expect(() => safeRelativePath(" ")).not.toThrow();
  });

  it("ダブルスラッシュ (空セグメント) は許可する", () => {
    expect(() => safeRelativePath("a//b")).not.toThrow();
  });

  it("日本語パスは許可する", () => {
    expect(() => safeRelativePath("フォルダ/ファイル.excalidraw")).not.toThrow();
  });

  it("バックスラッシュ traversal を拒否する", () => {
    expect(() => safeRelativePath("folder\\..\\secret")).toThrow("パストラバーサル");
  });
});

// ──────────────────────────────────────────────
// collectItems エッジケース
// ──────────────────────────────────────────────

describe("collectItems - エッジケース", () => {
  it("複数ドットのファイル名 (my.test.excalidraw) は収集する", async () => {
    makeFile(canvasesDir, "my.test.excalidraw");
    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my.test.excalidraw");
  });

  it('".excalidraw" (ドット始まり) はスキップする', async () => {
    makeFile(canvasesDir, ".excalidraw");
    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result).toHaveLength(0);
  });

  it("4階層の深いネストを再帰的に収集する", async () => {
    const a = makeDir(canvasesDir, "a");
    const b = makeDir(a, "b");
    const c = makeDir(b, "c");
    makeFile(c, "deep.excalidraw");

    const result = await collectItems(canvasesDir, canvasesDir);
    const deepFile = result[0].children![0].children![0].children![0];
    expect(deepFile.name).toBe("deep.excalidraw");
    expect(deepFile.path).toBe("a/b/c/deep.excalidraw");
  });

  it("ファイルの size と modified フィールドを返す", async () => {
    makeFile(canvasesDir, "test.excalidraw", '{"type":"excalidraw"}');
    const result = await collectItems(canvasesDir, canvasesDir);
    expect(result[0].size).toBeGreaterThan(0);
    expect(result[0].modified).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// createCanvas エッジケース
// ──────────────────────────────────────────────

describe("createCanvas - エッジケース", () => {
  it("既存ファイルを上書きする", async () => {
    makeFile(canvasesDir, "overwrite.excalidraw", "old content");
    await createCanvas("overwrite.excalidraw");

    const content = fs.readFileSync(
      path.join(canvasesDir, "overwrite.excalidraw"),
      "utf-8"
    );
    const data = JSON.parse(content);
    expect(data.type).toBe("excalidraw");
    expect(data.elements).toEqual([]);
  });

  it("パストラバーサル名でエラーになる", async () => {
    await expect(createCanvas("../evil.excalidraw")).rejects.toThrow("パストラバーサル");
  });
});

// ──────────────────────────────────────────────
// deleteItem エッジケース
// ──────────────────────────────────────────────

describe("deleteItem - エッジケース", () => {
  it("存在しないファイルでエラーになる", async () => {
    await expect(deleteItem("nonexistent.excalidraw")).rejects.toThrow();
  });

  it("パストラバーサルでエラーになる", async () => {
    await expect(deleteItem("../outside")).rejects.toThrow("パストラバーサル");
  });
});

// ──────────────────────────────────────────────
// renameItem エッジケース
// ──────────────────────────────────────────────

describe("renameItem - エッジケース", () => {
  it("存在しないソースでエラーになる", async () => {
    await expect(
      renameItem("nonexistent.excalidraw", "new.excalidraw")
    ).rejects.toThrow();
  });

  it("移動先が既存ファイルのとき上書きする", async () => {
    makeFile(canvasesDir, "src.excalidraw", "source content");
    makeFile(canvasesDir, "dst.excalidraw", "old content");

    await renameItem("src.excalidraw", "dst.excalidraw");

    expect(fs.existsSync(path.join(canvasesDir, "src.excalidraw"))).toBe(false);
    const content = fs.readFileSync(
      path.join(canvasesDir, "dst.excalidraw"),
      "utf-8"
    );
    expect(content).toBe("source content");
  });

  it("同名へのリネームは成功する", async () => {
    makeFile(canvasesDir, "same.excalidraw");
    await expect(renameItem("same.excalidraw", "same.excalidraw")).resolves.not.toThrow();
  });

  it("移動先の中間ディレクトリが存在しなくても自動作成する", async () => {
    makeFile(canvasesDir, "file.excalidraw");
    await renameItem("file.excalidraw", "new/nested/file.excalidraw");
    expect(
      fs.existsSync(path.join(canvasesDir, "new/nested/file.excalidraw"))
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────
// readCanvas エッジケース
// ──────────────────────────────────────────────

describe("readCanvas - エッジケース", () => {
  it("存在しないファイルでエラーになる", async () => {
    await expect(readCanvas("nonexistent.excalidraw")).rejects.toThrow();
  });

  it("空ファイルは空文字列を返す", async () => {
    makeFile(canvasesDir, "empty.excalidraw", "");
    const result = await readCanvas("empty.excalidraw");
    expect(result).toBe("");
  });

  it("パストラバーサルでエラーになる", async () => {
    await expect(readCanvas("../secret")).rejects.toThrow("パストラバーサル");
  });
});

// ──────────────────────────────────────────────
// saveCanvas エッジケース
// ──────────────────────────────────────────────

describe("saveCanvas - エッジケース", () => {
  it("空文字列を保存できる", async () => {
    await saveCanvas("empty.excalidraw", "");
    const result = await readCanvas("empty.excalidraw");
    expect(result).toBe("");
  });

  it("ユニコード文字を含むJSONを保存・復元できる", async () => {
    const content = JSON.stringify({ title: "テスト画像 🎨", elements: [] });
    await saveCanvas("unicode.excalidraw", content);
    const result = await readCanvas("unicode.excalidraw");
    expect(result).toBe(content);
  });

  it("大きなコンテンツ (100KB) を保存できる", async () => {
    const large = JSON.stringify({ data: "x".repeat(100 * 1024) });
    await saveCanvas("large.excalidraw", large);
    const result = await readCanvas("large.excalidraw");
    expect(result).toBe(large);
  });

  it("中間ディレクトリが存在しなくても自動作成する", async () => {
    await saveCanvas("deep/nested/canvas.excalidraw", "{}");
    expect(
      fs.existsSync(path.join(canvasesDir, "deep/nested/canvas.excalidraw"))
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────
// copyCanvas エッジケース
// ──────────────────────────────────────────────

describe("copyCanvas - エッジケース", () => {
  it("宛先の中間ディレクトリを自動作成してコピーする", async () => {
    makeFile(canvasesDir, "source.excalidraw", "content");
    await copyCanvas("source.excalidraw", "sub/folder/dest.excalidraw");
    expect(
      fs.existsSync(path.join(canvasesDir, "sub/folder/dest.excalidraw"))
    ).toBe(true);
  });

  it("自分自身へのコピーはエラーになる", async () => {
    makeFile(canvasesDir, "self.excalidraw");
    await expect(
      copyCanvas("self.excalidraw", "self.excalidraw")
    ).rejects.toThrow("Destination file already exists");
  });

  it("ソースにアイコンメタがない場合はエラーにならない", async () => {
    makeFile(canvasesDir, "no-icon.excalidraw", "data");
    await expect(
      copyCanvas("no-icon.excalidraw", "copy.excalidraw")
    ).resolves.not.toThrow();
    expect(
      fs.existsSync(path.join(canvasesDir, "copy.excalidraw"))
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────
// trash エッジケース
// ──────────────────────────────────────────────

describe("trash operations - エッジケース", () => {
  it("存在しないアイテムをゴミ箱に移動しようとするとエラー", async () => {
    await expect(trashItem("nonexistent.excalidraw")).rejects.toThrow();
  });

  it("フォルダをゴミ箱に移動できる", async () => {
    const sub = makeDir(canvasesDir, "myFolder");
    makeFile(sub, "child.excalidraw");

    await trashItem("myFolder");

    expect(fs.existsSync(path.join(canvasesDir, "myFolder"))).toBe(false);
    const items = await listTrash();
    expect(items).toHaveLength(1);
    expect(items[0].isFolder).toBe(true);
    expect(items[0].name).toBe("myFolder");
  });

  it("listTrash: .metaファイルがないエントリはスキップされる", async () => {
    // ゴミ箱に .meta なしで直接ファイルを置く
    makeFile(trashDir, "orphan.excalidraw", "data");

    const items = await listTrash();
    expect(items).toHaveLength(0);
  });

  it("listTrash: .metaが壊れたエントリはスキップされる", async () => {
    makeFile(trashDir, "broken.excalidraw", "data");
    makeFile(trashDir, "broken.excalidraw.meta", "NOT JSON {{{");

    const items = await listTrash();
    expect(items).toHaveLength(0);
  });

  it("listTrash: 複数アイテムを新しい順で返す", async () => {
    makeFile(canvasesDir, "first.excalidraw");
    await trashItem("first.excalidraw");

    // 確実に別のタイムスタンプにするため少し待つ
    await new Promise((r) => setTimeout(r, 10));

    makeFile(canvasesDir, "second.excalidraw");
    await trashItem("second.excalidraw");

    const items = await listTrash();
    expect(items).toHaveLength(2);
    // 新しい順: second が先
    expect(items[0].originalPath).toBe("second.excalidraw");
    expect(items[1].originalPath).toBe("first.excalidraw");
  });

  it("restoreItem: 復元先に既存ファイルがある場合は上書きする", async () => {
    makeFile(canvasesDir, "restore-target.excalidraw", "old");
    makeFile(canvasesDir, "restore-src.excalidraw", "new content");
    await trashItem("restore-src.excalidraw");

    // 同名ファイルを canvases に作成
    makeFile(canvasesDir, "restore-src.excalidraw", "existing");

    const items = await listTrash();
    const src = items.find((i) => i.originalPath === "restore-src.excalidraw")!;
    await restoreItem(src.trashPath);

    const content = fs.readFileSync(
      path.join(canvasesDir, "restore-src.excalidraw"),
      "utf-8"
    );
    expect(content).toBe("new content");
  });

  it("emptyTrash: 既に空のゴミ箱でエラーにならない", async () => {
    await expect(emptyTrash()).resolves.not.toThrow();
    const items = await listTrash();
    expect(items).toHaveLength(0);
  });

  it("deletePermanently: 存在しないtrashPathでエラーになる", async () => {
    await expect(deletePermanently("nonexistent")).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// setItemIcon エッジケース
// ──────────────────────────────────────────────

describe("setItemIcon - エッジケース", () => {
  it("既存アイコンを上書きできる", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    await setItemIcon("test.excalidraw", "Star", "#ff0000");
    await setItemIcon("test.excalidraw", "Moon", "#00ff00");

    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBe("Moon");
    expect(result.iconColor).toBe("#00ff00");
  });

  it("null color は color なしとして保存する", async () => {
    makeFile(canvasesDir, "test.excalidraw");
    await setItemIcon("test.excalidraw", "Star", null);

    const metaPath = path.join(canvasesDir, ".meta", "test.excalidraw.icon");
    expect(fs.readFileSync(metaPath, "utf-8")).toBe("Star");
  });

  it("ネストパスのアイテムにアイコンを設定できる", async () => {
    const sub = makeDir(canvasesDir, "folder");
    makeFile(sub, "nested.excalidraw");

    await setItemIcon("folder/nested.excalidraw", "Folder", "#89b4fa");
    const result = loadItemIcon(canvasesDir, "folder/nested.excalidraw");
    expect(result.icon).toBe("Folder");
    expect(result.iconColor).toBe("#89b4fa");
  });
});

// ──────────────────────────────────────────────
// loadItemIcon エッジケース
// ──────────────────────────────────────────────

describe("loadItemIcon - エッジケース", () => {
  it("空のアイコンファイルは icon='' を返す", () => {
    const metaDir = makeDir(canvasesDir, ".meta");
    fs.writeFileSync(path.join(metaDir, "test.excalidraw.icon"), "");

    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBe("");
    expect(result.iconColor).toBeUndefined();
  });

  it("3パーツのコロン区切り (A:B:C) は文字列全体を icon として返す", () => {
    const metaDir = makeDir(canvasesDir, ".meta");
    fs.writeFileSync(path.join(metaDir, "test.excalidraw.icon"), "A:B:C");

    const result = loadItemIcon(canvasesDir, "test.excalidraw");
    expect(result.icon).toBe("A:B:C");
    expect(result.iconColor).toBeUndefined();
  });

  it("ネストパスはアンダースコアで区切ったメタファイルに保存される", () => {
    const metaDir = makeDir(canvasesDir, ".meta");
    // "folder/test.excalidraw" → "folder_test.excalidraw.icon"
    fs.writeFileSync(
      path.join(metaDir, "folder_test.excalidraw.icon"),
      "Star:#cba6f7"
    );

    const result = loadItemIcon(canvasesDir, "folder/test.excalidraw");
    expect(result.icon).toBe("Star");
    expect(result.iconColor).toBe("#cba6f7");
  });
});
