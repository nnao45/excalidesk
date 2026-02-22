import { FileItem } from "../types";

export function findFileByPath(tree: FileItem[], path: string): FileItem | null {
  for (const item of tree) {
    if (item.path === path) return item;
    if (item.isFolder && item.children) {
      const found = findFileByPath(item.children, path);
      if (found) return found;
    }
  }
  return null;
}
