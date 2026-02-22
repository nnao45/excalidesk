import { useCallback } from "react";
import { FileItem, TrashItem } from "../types";

export function useElectronFS() {
  const listDir = useCallback((path: string = ""): Promise<FileItem[]> => {
    return window.electronAPI.listDir(path);
  }, []);

  const createFolder = useCallback((path: string): Promise<void> => {
    return window.electronAPI.createFolder(path);
  }, []);

  const createCanvas = useCallback((path: string): Promise<void> => {
    return window.electronAPI.createCanvas(path);
  }, []);

  const deleteItem = useCallback((path: string): Promise<void> => {
    return window.electronAPI.deleteItem(path);
  }, []);

  const renameItem = useCallback(
    (oldPath: string, newPath: string): Promise<void> => {
      return window.electronAPI.renameItem(oldPath, newPath);
    },
    []
  );

  const readCanvas = useCallback((path: string): Promise<string> => {
    return window.electronAPI.readCanvas(path);
  }, []);

  const saveCanvas = useCallback(
    (path: string, content: string): Promise<void> => {
      return window.electronAPI.saveCanvas(path, content);
    },
    []
  );

  const copyCanvas = useCallback(
    (sourcePath: string, destPath: string): Promise<void> => {
      return window.electronAPI.copyCanvas(sourcePath, destPath);
    },
    []
  );

  const getBaseDirectory = useCallback((): Promise<string> => {
    return window.electronAPI.getBaseDirectory();
  }, []);

  const trashItem = useCallback((path: string): Promise<void> => {
    return window.electronAPI.trashItem(path);
  }, []);

  const listTrash = useCallback((): Promise<TrashItem[]> => {
    return window.electronAPI.listTrash();
  }, []);

  const restoreItem = useCallback((trashPath: string): Promise<void> => {
    return window.electronAPI.restoreItem(trashPath);
  }, []);

  const deletePermanently = useCallback((trashPath: string): Promise<void> => {
    return window.electronAPI.deletePermanently(trashPath);
  }, []);

  const emptyTrash = useCallback((): Promise<void> => {
    return window.electronAPI.emptyTrash();
  }, []);

  const setItemIcon = useCallback(
    (path: string, icon: string, color?: string): Promise<void> => {
      return window.electronAPI.setItemIcon(path, icon, color || null);
    },
    []
  );

  return {
    listDir,
    createFolder,
    createCanvas,
    deleteItem,
    renameItem,
    readCanvas,
    saveCanvas,
    copyCanvas,
    getBaseDirectory,
    trashItem,
    listTrash,
    restoreItem,
    deletePermanently,
    emptyTrash,
    setItemIcon,
  };
}
