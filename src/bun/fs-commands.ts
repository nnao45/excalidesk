import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

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

interface TrashMeta {
  original_path: string;
  trashed_at: number;
}

// ──────────────────────────────────────────────
// Directory resolution (framework-agnostic)
// ──────────────────────────────────────────────

function getUserDataDir(): string {
  const home = os.homedir();
  if (process.platform === "linux") {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    return path.join(xdgConfig, "excalidesk");
  } else if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "excalidesk");
  } else {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "excalidesk");
  }
}

export function resolveBaseDir(): string {
  return path.join(getUserDataDir(), "canvases");
}

export function resolveTrashDir(): string {
  return path.join(getUserDataDir(), "trash");
}

// ──────────────────────────────────────────────
// Path safety
// ──────────────────────────────────────────────

export function safeRelativePath(relative: string): void {
  if (!relative) return;

  // Check for parent directory traversal BEFORE normalization
  const parts = relative.split(/[/\\]/);
  for (const part of parts) {
    if (part === "..") {
      throw new Error("パストラバーサルは許可されていません");
    }
  }

  const normalized = path.normalize(relative);

  // Reject absolute paths
  if (path.isAbsolute(normalized)) {
    throw new Error("絶対パスは使用できません");
  }
}

// ──────────────────────────────────────────────
// Icon metadata helpers
// ──────────────────────────────────────────────

function getIconMetaPath(base: string, itemPath: string): string {
  const metaDir = path.join(base, ".meta");
  const safePath = itemPath.replace(/\//g, "_").replace(/\\/g, "_");
  return path.join(metaDir, `${safePath}.icon`);
}

export function loadItemIcon(
  base: string,
  itemPath: string
): { icon: string | undefined; iconColor: string | undefined } {
  const metaPath = getIconMetaPath(base, itemPath);
  try {
    const content = fsSync.readFileSync(metaPath, "utf-8");
    const parts = content.split(":");
    if (parts.length === 2) {
      return { icon: parts[0], iconColor: parts[1] };
    }
    return { icon: content, iconColor: undefined };
  } catch {
    return { icon: undefined, iconColor: undefined };
  }
}

// ──────────────────────────────────────────────
// File collection
// ──────────────────────────────────────────────

export async function collectItems(
  base: string,
  dir: string
): Promise<FileItem[]> {
  const items: FileItem[] = [];

  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(String(err));
  }

  for (const entry of entries) {
    const name = entry.name;

    // Skip hidden files/folders
    if (name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(dir, name);
    const relativePath = path.relative(base, entryPath).replace(/\\/g, "/");
    const isFolder = entry.isDirectory();

    // Load icon from metadata
    const { icon, iconColor } = loadItemIcon(base, relativePath);

    // Get file metadata
    let modified: number | undefined;
    let size: number | undefined;
    try {
      const stat = await fs.stat(entryPath);
      modified = Math.floor(stat.mtimeMs / 1000);
      if (!isFolder) {
        size = stat.size;
      }
    } catch {
      // ignore stat errors
    }

    if (isFolder) {
      const children = await collectItems(base, entryPath);
      items.push({
        name,
        path: relativePath,
        isFolder: true,
        children,
        icon,
        iconColor,
        modified,
        size,
      });
    } else if (name.endsWith(".excalidraw")) {
      items.push({
        name,
        path: relativePath,
        isFolder: false,
        children: undefined,
        icon,
        iconColor,
        modified,
        size,
      });
    }
    // Skip non-.excalidraw files silently
  }

  // Sort: folders first, then files alphabetically (case-insensitive)
  items.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return items;
}

// ──────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────

export async function getBaseDirectory(): Promise<string> {
  return resolveBaseDir();
}

export async function listDir(relativePath: string): Promise<FileItem[]> {
  const base = resolveBaseDir();

  let target: string;
  if (!relativePath) {
    target = base;
  } else {
    safeRelativePath(relativePath);
    target = path.join(base, relativePath);
  }

  try {
    await fs.access(target);
  } catch {
    return [];
  }

  return collectItems(base, target);
}

export async function createFolder(relativePath: string): Promise<void> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const fullPath = path.join(base, relativePath);
  await fs.mkdir(fullPath, { recursive: true });
}

export async function createCanvas(relativePath: string): Promise<void> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const fullPath = path.join(base, relativePath);

  const parent = path.dirname(fullPath);
  await fs.mkdir(parent, { recursive: true });

  const defaultContent = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "excalidesk",
    elements: [],
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files: {},
  });
  await fs.writeFile(fullPath, defaultContent);
}

export async function deleteItem(relativePath: string): Promise<void> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const fullPath = path.join(base, relativePath);

  const stat = await fs.stat(fullPath);
  if (stat.isDirectory()) {
    await fs.rm(fullPath, { recursive: true });
  } else {
    await fs.unlink(fullPath);
  }
}

export async function renameItem(
  oldPath: string,
  newPath: string
): Promise<void> {
  safeRelativePath(oldPath);
  safeRelativePath(newPath);
  const base = resolveBaseDir();
  const oldFull = path.join(base, oldPath);
  const newFull = path.join(base, newPath);

  const parent = path.dirname(newFull);
  await fs.mkdir(parent, { recursive: true });

  await fs.rename(oldFull, newFull);
}

export async function readCanvas(relativePath: string): Promise<string> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const fullPath = path.join(base, relativePath);
  return fs.readFile(fullPath, "utf-8");
}

export async function saveCanvas(
  relativePath: string,
  content: string
): Promise<void> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const fullPath = path.join(base, relativePath);

  const parent = path.dirname(fullPath);
  await fs.mkdir(parent, { recursive: true });

  await fs.writeFile(fullPath, content);
}

export async function copyCanvas(
  sourcePath: string,
  destPath: string
): Promise<void> {
  safeRelativePath(sourcePath);
  safeRelativePath(destPath);
  const base = resolveBaseDir();
  const source = path.join(base, sourcePath);
  const dest = path.join(base, destPath);

  try {
    await fs.access(source);
  } catch {
    throw new Error("Source file does not exist");
  }

  try {
    await fs.access(dest);
    throw new Error("Destination file already exists");
  } catch (err) {
    if ((err as Error).message === "Destination file already exists") throw err;
    // File doesn't exist - this is expected
  }

  const parent = path.dirname(dest);
  await fs.mkdir(parent, { recursive: true });

  await fs.copyFile(source, dest);

  // Copy icon metadata if exists
  const sourceMeta = getIconMetaPath(base, sourcePath);
  const destMeta = getIconMetaPath(base, destPath);

  try {
    await fs.access(sourceMeta);
    const metaDir = path.join(base, ".meta");
    await fs.mkdir(metaDir, { recursive: true });
    await fs.copyFile(sourceMeta, destMeta);
  } catch {
    // No icon metadata to copy
  }
}

export async function trashItem(relativePath: string): Promise<void> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const trash = resolveTrashDir();

  await fs.mkdir(trash, { recursive: true });

  const source = path.join(base, relativePath);
  // Validate source exists
  await fs.stat(source);

  const originalName = path.basename(source);
  const ts = Date.now();

  const trashName = `${ts}_${originalName}`;
  const dest = path.join(trash, trashName);

  await fs.rename(source, dest);

  const meta: TrashMeta = {
    original_path: relativePath,
    trashed_at: ts,
  };
  const metaPath = path.join(trash, `${trashName}.meta`);
  await fs.writeFile(metaPath, JSON.stringify(meta));
}

export async function listTrash(): Promise<TrashItem[]> {
  const trash = resolveTrashDir();

  try {
    await fs.access(trash);
  } catch {
    return [];
  }

  const items: TrashItem[] = [];
  const entries = await fs.readdir(trash, { withFileTypes: true });

  for (const entry of entries) {
    const name = entry.name;

    if (name.endsWith(".meta")) {
      continue;
    }

    const isFolder = entry.isDirectory();
    const metaPath = path.join(trash, `${name}.meta`);

    let metaJson: string;
    try {
      metaJson = await fs.readFile(metaPath, "utf-8");
    } catch {
      continue;
    }

    let meta: TrashMeta;
    try {
      meta = JSON.parse(metaJson);
    } catch {
      continue;
    }

    const originalName = path.basename(meta.original_path) || name;

    const displayName =
      !isFolder && originalName.endsWith(".excalidraw")
        ? originalName.slice(0, -".excalidraw".length)
        : originalName;

    items.push({
      name: displayName,
      trashPath: name,
      originalPath: meta.original_path,
      isFolder,
      trashedAt: meta.trashed_at,
    });
  }

  // Sort by trashed time, newest first
  items.sort((a, b) => b.trashedAt - a.trashedAt);

  return items;
}

export async function restoreItem(trashPath: string): Promise<void> {
  const trash = resolveTrashDir();
  const base = resolveBaseDir();

  const source = path.join(trash, trashPath);
  const metaPath = path.join(trash, `${trashPath}.meta`);

  const metaJson = await fs.readFile(metaPath, "utf-8");
  const meta: TrashMeta = JSON.parse(metaJson);

  safeRelativePath(meta.original_path);
  const dest = path.join(base, meta.original_path);

  const parent = path.dirname(dest);
  await fs.mkdir(parent, { recursive: true });

  await fs.rename(source, dest);
  await fs.unlink(metaPath).catch(() => {});
}

export async function deletePermanently(trashPath: string): Promise<void> {
  const trash = resolveTrashDir();

  const target = path.join(trash, trashPath);
  const metaPath = path.join(trash, `${trashPath}.meta`);

  const stat = await fs.stat(target);
  if (stat.isDirectory()) {
    await fs.rm(target, { recursive: true });
  } else {
    await fs.unlink(target);
  }

  await fs.unlink(metaPath).catch(() => {});
}

export async function emptyTrash(): Promise<void> {
  const trash = resolveTrashDir();

  try {
    await fs.access(trash);
  } catch {
    return;
  }

  const entries = await fs.readdir(trash, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(trash, entry.name);
    if (entry.isDirectory()) {
      await fs.rm(entryPath, { recursive: true });
    } else {
      await fs.unlink(entryPath);
    }
  }
}

export async function setItemIcon(
  relativePath: string,
  icon: string,
  color?: string | null
): Promise<void> {
  safeRelativePath(relativePath);
  const base = resolveBaseDir();
  const metaDir = path.join(base, ".meta");

  await fs.mkdir(metaDir, { recursive: true });

  const metaPath = getIconMetaPath(base, relativePath);
  const content = color ? `${icon}:${color}` : icon;
  await fs.writeFile(metaPath, content);
}
