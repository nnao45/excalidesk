import { useCallback } from "react";
import type { FileItem, TrashItem } from "../types";
import { rpc } from "../rpc";

export function useElectronFS() {
  const listDir = useCallback((path: string = ""): Promise<FileItem[]> => {
    return rpc.request.listDir({ path }) as Promise<FileItem[]>;
  }, []);

  const createFolder = useCallback((path: string): Promise<void> => {
    return rpc.request.createFolder({ path }) as Promise<void>;
  }, []);

  const createCanvas = useCallback((path: string): Promise<void> => {
    return rpc.request.createCanvas({ path }) as Promise<void>;
  }, []);

  const deleteItem = useCallback((path: string): Promise<void> => {
    return rpc.request.deleteItem({ path }) as Promise<void>;
  }, []);

  const renameItem = useCallback(
    (oldPath: string, newPath: string): Promise<void> => {
      return rpc.request.renameItem({ oldPath, newPath }) as Promise<void>;
    },
    []
  );

  const readCanvas = useCallback((path: string): Promise<string> => {
    return rpc.request.readCanvas({ path }) as Promise<string>;
  }, []);

  const saveCanvas = useCallback(
    (path: string, content: string): Promise<void> => {
      return rpc.request.saveCanvas({ path, content }) as Promise<void>;
    },
    []
  );

  const copyCanvas = useCallback(
    (sourcePath: string, destPath: string): Promise<void> => {
      return rpc.request.copyCanvas({ sourcePath, destPath }) as Promise<void>;
    },
    []
  );

  const getBaseDirectory = useCallback((): Promise<string> => {
    return rpc.request.getBaseDirectory({}) as Promise<string>;
  }, []);

  const trashItem = useCallback((path: string): Promise<void> => {
    return rpc.request.trashItem({ path }) as Promise<void>;
  }, []);

  const listTrash = useCallback((): Promise<TrashItem[]> => {
    return rpc.request.listTrash({}) as Promise<TrashItem[]>;
  }, []);

  const restoreItem = useCallback((trashPath: string): Promise<void> => {
    return rpc.request.restoreItem({ trashPath }) as Promise<void>;
  }, []);

  const deletePermanently = useCallback((trashPath: string): Promise<void> => {
    return rpc.request.deletePermanently({ trashPath }) as Promise<void>;
  }, []);

  const emptyTrash = useCallback((): Promise<void> => {
    return rpc.request.emptyTrash({}) as Promise<void>;
  }, []);

  const setItemIcon = useCallback(
    (path: string, icon: string, color?: string): Promise<void> => {
      return rpc.request.setItemIcon({
        path,
        icon,
        color: color ?? null,
      }) as Promise<void>;
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
