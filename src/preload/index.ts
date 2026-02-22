import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  listDir: (path: string = ""): Promise<unknown[]> =>
    ipcRenderer.invoke("fs:listDir", path),

  createFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke("fs:createFolder", path),

  createCanvas: (path: string): Promise<void> =>
    ipcRenderer.invoke("fs:createCanvas", path),

  deleteItem: (path: string): Promise<void> =>
    ipcRenderer.invoke("fs:deleteItem", path),

  renameItem: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke("fs:renameItem", oldPath, newPath),

  readCanvas: (path: string): Promise<string> =>
    ipcRenderer.invoke("fs:readCanvas", path),

  saveCanvas: (path: string, content: string): Promise<void> =>
    ipcRenderer.invoke("fs:saveCanvas", path, content),

  copyCanvas: (sourcePath: string, destPath: string): Promise<void> =>
    ipcRenderer.invoke("fs:copyCanvas", sourcePath, destPath),

  getBaseDirectory: (): Promise<string> =>
    ipcRenderer.invoke("fs:getBaseDirectory"),

  trashItem: (path: string): Promise<void> =>
    ipcRenderer.invoke("fs:trashItem", path),

  listTrash: (): Promise<unknown[]> =>
    ipcRenderer.invoke("fs:listTrash"),

  restoreItem: (trashPath: string): Promise<void> =>
    ipcRenderer.invoke("fs:restoreItem", trashPath),

  deletePermanently: (trashPath: string): Promise<void> =>
    ipcRenderer.invoke("fs:deletePermanently", trashPath),

  emptyTrash: (): Promise<void> =>
    ipcRenderer.invoke("fs:emptyTrash"),

  setItemIcon: (path: string, icon: string, color?: string | null): Promise<void> =>
    ipcRenderer.invoke("fs:setItemIcon", path, icon, color),

  showOpenDialog: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),

  loadSettings: (): Promise<unknown> =>
    ipcRenderer.invoke("settings:load"),

  saveSettings: (settings: unknown): Promise<void> =>
    ipcRenderer.invoke("settings:save", settings),

  mcpStart: (port: number): Promise<unknown> =>
    ipcRenderer.invoke("mcp:start", port),

  mcpStop: (): Promise<unknown> =>
    ipcRenderer.invoke("mcp:stop"),

  mcpStatus: (): Promise<unknown> =>
    ipcRenderer.invoke("mcp:status"),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
