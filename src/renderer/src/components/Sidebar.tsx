import { useState, useEffect, useCallback, useRef } from "react";
import { Pencil, Folder, RefreshCw, File, ChevronRight, ChevronDown, FileText, Image, Video, Music, Code, Database, Archive, FileJson, Table, BookOpen, Newspaper, Palette, Briefcase, ShoppingCart, Heart, Star, Zap, Trophy, Target, Flag, Bell, Calendar, Clock, Mail, MessageSquare, Phone, User, Users, Home, Building, Globe, Map, Settings as SettingsIcon, Wrench, Package, Box, Gift, Coffee, Lightbulb, Flame, Sparkles, Search, type LucideIcon } from "lucide-react";
import { FileItem, ContextMenuState, TrashItem } from "../types";
import { useElectronFS } from "../hooks/useElectronFS";
import { Dialog, ConfirmDialog } from "./Dialog";
import { IconPicker } from "./IconPicker";

const iconMap: Record<string, LucideIcon> = {
  File, FileText, Image, Video, Music, Code, Database, Archive, FileJson, Table,
  BookOpen, Newspaper, Palette, Briefcase, Heart, Star, Zap, Trophy, Target, Flag,
  Sparkles, Flame, Bell, Mail, MessageSquare, Phone, Calendar, Clock, Home, Building,
  Globe, Map, User, Users, SettingsIcon, Wrench, Package, Box, Gift, ShoppingCart,
  Coffee, Lightbulb, Folder,
};

interface SidebarProps {
  fileTree: FileItem[];
  selectedFile: FileItem | null;
  onSelectFile: (item: FileItem) => void;
  onRefresh: () => void;
}

interface TreeNodeProps {
  item: FileItem;
  depth: number;
  selectedFile: FileItem | null;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (item: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onMove: (sourcePath: string, targetFolderPath: string) => void;
  onIconClick: (item: FileItem) => void;
  onRename: (item: FileItem, newName: string) => void;
}

function TreeNode({
  item,
  depth,
  selectedFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onContextMenu,
  onMove,
  onIconClick,
  onRename,
}: TreeNodeProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExpanded = expandedFolders.has(item.path);
  const isSelected = selectedFile?.path === item.path;

  const handleClick = () => {
    if (item.isFolder) {
      onToggleFolder(item.path);
    } else {
      onSelectFile(item);
    }
  };

  const handleLabelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClick();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const displayName = item.name.endsWith(".excalidraw")
      ? item.name.slice(0, -".excalidraw".length)
      : item.name;
    setEditValue(displayName);
    setIsEditing(true);
  };

  const handleEditSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== (item.name.endsWith(".excalidraw")
      ? item.name.slice(0, -".excalidraw".length)
      : item.name)) {
      onRename(item, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditBlur = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== (item.name.endsWith(".excalidraw")
      ? item.name.slice(0, -".excalidraw".length)
      : item.name)) {
      onRename(item, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.isFolder) {
      onToggleFolder(item.path);
    } else {
      onIconClick(item);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.path);
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!item.isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!item.isFolder) return;

    const sourcePath = e.dataTransfer.getData("text/plain");
    if (sourcePath && sourcePath !== item.path && !sourcePath.startsWith(item.path + "/")) {
      onMove(sourcePath, item.path);
    }
  };

  const displayName = item.name.endsWith(".excalidraw")
    ? item.name.slice(0, -".excalidraw".length)
    : item.name;

  const IconComponent = item.icon && iconMap[item.icon] ? iconMap[item.icon] : File;
  const iconColor = item.iconColor && item.iconColor !== "default" ? item.iconColor : undefined;

  return (
    <div>
      <div
        className={`tree-node ${isSelected ? "selected" : ""} ${isDragOver ? "drag-over" : ""}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, item)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={displayName}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="tree-node-icon" onClick={handleIconClick}>
          {item.isFolder ? (
            isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <IconComponent size={16} style={{ color: iconColor }} />
          )}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="tree-node-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleEditBlur}
            onKeyDown={handleEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="tree-node-label" onClick={handleLabelClick}>
              {displayName}
            </span>
            {isHovered && (
              <button
                className="tree-node-edit-button"
                onClick={handleEditClick}
                title="名前を変更"
              >
                <Pencil size={12} />
              </button>
            )}
          </>
        )}
      </div>

      {item.isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <TreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
              onContextMenu={onContextMenu}
              onMove={onMove}
              onIconClick={onIconClick}
              onRename={onRename}
            />
          ))}
          {item.children.length === 0 && (
            <div
              className="tree-node-empty"
              style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
            >
              空のフォルダ
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onNewCanvas: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (item: FileItem) => void;
  onTrash: (item: FileItem) => void;
}

function ContextMenu({
  menu,
  onClose,
  onNewCanvas,
  onNewFolder,
  onRename,
  onTrash,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const targetPath = menu.item?.path ?? "";
  const parentPath = menu.item?.isFolder ? targetPath : menu.parentPath;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          onNewCanvas(parentPath);
          onClose();
        }}
      >
        ＋ 新規キャンバス
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          onNewFolder(parentPath);
          onClose();
        }}
      >
        ＋ 新規フォルダ
      </button>
      {menu.item && (
        <>
          <div className="context-menu-separator" />
          <button
            className="context-menu-item"
            onClick={() => {
              onRename(menu.item!);
              onClose();
            }}
          >
            名前変更
          </button>
          <button
            className="context-menu-item danger"
            onClick={() => {
              onTrash(menu.item!);
              onClose();
            }}
          >
            ゴミ箱へ移動
          </button>
        </>
      )}
    </div>
  );
}

interface TrashContextMenuState {
  x: number;
  y: number;
  item: TrashItem;
}

interface TrashContextMenuProps {
  menu: TrashContextMenuState;
  onClose: () => void;
  onRestore: (item: TrashItem) => void;
  onDeletePermanently: (item: TrashItem) => void;
}

function TrashContextMenu({
  menu,
  onClose,
  onRestore,
  onDeletePermanently,
}: TrashContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          onRestore(menu.item);
          onClose();
        }}
      >
        復元
      </button>
      <div className="context-menu-separator" />
      <button
        className="context-menu-item danger"
        onClick={() => {
          onDeletePermanently(menu.item);
          onClose();
        }}
      >
        完全に削除
      </button>
    </div>
  );
}

export function Sidebar({
  fileTree,
  selectedFile,
  onSelectFile,
  onRefresh,
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [isTrashExpanded, setIsTrashExpanded] = useState(false);
  const [trashContextMenu, setTrashContextMenu] =
    useState<TrashContextMenuState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedFile, setCopiedFile] = useState<FileItem | null>(null);

  const [newCanvasDialog, setNewCanvasDialog] = useState<{ isOpen: boolean; parentPath: string }>({
    isOpen: false,
    parentPath: "",
  });
  const [newFolderDialog, setNewFolderDialog] = useState<{ isOpen: boolean; parentPath: string }>({
    isOpen: false,
    parentPath: "",
  });
  const [renameDialog, setRenameDialog] = useState<{ isOpen: boolean; item: FileItem | null }>({
    isOpen: false,
    item: null,
  });
  const [trashConfirmDialog, setTrashConfirmDialog] = useState<{ isOpen: boolean; item: FileItem | null }>({
    isOpen: false,
    item: null,
  });
  const [emptyTrashDialog, setEmptyTrashDialog] = useState(false);
  const [deletePermanentlyDialog, setDeletePermanentlyDialog] = useState<{ isOpen: boolean; item: TrashItem | null }>({
    isOpen: false,
    item: null,
  });
  const [iconPickerState, setIconPickerState] = useState<{ isOpen: boolean; item: FileItem | null }>({
    isOpen: false,
    item: null,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentBaseDir, setCurrentBaseDir] = useState<string>("");

  const {
    createCanvas,
    createFolder,
    trashItem,
    renameItem,
    listTrash,
    restoreItem,
    deletePermanently,
    emptyTrash,
    setItemIcon,
    copyCanvas,
    getBaseDirectory,
  } = useElectronFS();

  const loadTrash = useCallback(async () => {
    try {
      const items = await listTrash();
      setTrashItems(items);
    } catch {
      // ignore
    }
  }, [listTrash]);

  useEffect(() => {
    loadTrash();
    loadBaseDirectory();
  }, [loadTrash]);

  const loadBaseDirectory = useCallback(async () => {
    try {
      const dir = await getBaseDirectory();
      setCurrentBaseDir(dir);
    } catch {
      // ignore
    }
  }, [getBaseDirectory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey && e.key === 'c' && selectedFile && !selectedFile.isFolder) {
        e.preventDefault();
        setCopiedFile(selectedFile);
      }

      if (ctrlKey && e.key === 'v' && copiedFile) {
        e.preventDefault();
        handlePaste();
      }

      if (e.key === 'Delete' && selectedFile) {
        e.preventDefault();
        handleTrash(selectedFile);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, copiedFile]);

  const handlePaste = useCallback(async () => {
    if (!copiedFile) return;

    const originalName = copiedFile.name.endsWith(".excalidraw")
      ? copiedFile.name.slice(0, -".excalidraw".length)
      : copiedFile.name;

    let targetPath = "";
    if (selectedFile) {
      if (selectedFile.isFolder) {
        targetPath = selectedFile.path;
      } else {
        const parentPath = selectedFile.path.includes("/")
          ? selectedFile.path.substring(0, selectedFile.path.lastIndexOf("/"))
          : "";
        targetPath = parentPath;
      }
    }

    let counter = 1;
    let newName = `${originalName} copy`;
    let newPath = targetPath ? `${targetPath}/${newName}.excalidraw` : `${newName}.excalidraw`;

    const checkExists = (path: string): boolean => {
      const check = (items: FileItem[]): boolean => {
        for (const item of items) {
          if (item.path === path) return true;
          if (item.isFolder && item.children) {
            if (check(item.children)) return true;
          }
        }
        return false;
      };
      return check(fileTree);
    };

    while (checkExists(newPath)) {
      counter++;
      newName = `${originalName} copy ${counter}`;
      newPath = targetPath ? `${targetPath}/${newName}.excalidraw` : `${newName}.excalidraw`;
    }

    try {
      await copyCanvas(copiedFile.path, newPath);
      onRefresh();

      if (targetPath) {
        setExpandedFolders((prev) => new Set([...prev, targetPath]));
      }
    } catch (err) {
      alert(`コピーに失敗しました: ${err}`);
    }
  }, [copiedFile, selectedFile, fileTree, copyCanvas, onRefresh]);

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, item: FileItem) => {
      e.preventDefault();
      e.stopPropagation();

      const parentPath = item.isFolder
        ? item.path
        : item.path.includes("/")
          ? item.path.substring(0, item.path.lastIndexOf("/"))
          : "";

      setContextMenu({ x: e.clientX, y: e.clientY, item, parentPath });
    },
    []
  );

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item: null, parentPath: "" });
  }, []);

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleRootDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const sourcePath = e.dataTransfer.getData("text/plain");
      if (!sourcePath || !sourcePath.includes("/")) return;

      const fileName = sourcePath.substring(sourcePath.lastIndexOf("/") + 1);
      try {
        await renameItem(sourcePath, fileName);
        onRefresh();
      } catch (err) {
        alert(`移動に失敗しました: ${err}`);
      }
    },
    [renameItem, onRefresh]
  );

  const handleTrashContextMenu = useCallback(
    (e: React.MouseEvent, item: TrashItem) => {
      e.preventDefault();
      e.stopPropagation();
      setTrashContextMenu({ x: e.clientX, y: e.clientY, item });
    },
    []
  );

  const handleNewCanvas = useCallback(
    (parentPath: string) => {
      setNewCanvasDialog({ isOpen: true, parentPath });
    },
    []
  );

  const handleNewCanvasConfirm = useCallback(
    async (name: string) => {
      const { parentPath } = newCanvasDialog;
      setNewCanvasDialog({ isOpen: false, parentPath: "" });

      const safeName = name.replace(/[/\\?%*:|"<>]/g, "-");
      const canvasName = safeName.endsWith(".excalidraw")
        ? safeName
        : `${safeName}.excalidraw`;
      const fullPath = parentPath ? `${parentPath}/${canvasName}` : canvasName;
      try {
        await createCanvas(fullPath);
        onRefresh();
      } catch (err) {
        alert(`キャンバスの作成に失敗しました: ${err}`);
      }
    },
    [createCanvas, onRefresh, newCanvasDialog]
  );

  const handleNewFolder = useCallback(
    (parentPath: string) => {
      setNewFolderDialog({ isOpen: true, parentPath });
    },
    []
  );

  const handleNewFolderConfirm = useCallback(
    async (name: string) => {
      const { parentPath } = newFolderDialog;
      setNewFolderDialog({ isOpen: false, parentPath: "" });

      const safeName = name.replace(/[/\\?%*:|"<>]/g, "-");
      const fullPath = parentPath ? `${parentPath}/${safeName}` : safeName;
      try {
        await createFolder(fullPath);
        onRefresh();
        setExpandedFolders((prev) => new Set([...prev, fullPath]));
      } catch (err) {
        alert(`フォルダの作成に失敗しました: ${err}`);
      }
    },
    [createFolder, onRefresh, newFolderDialog]
  );

  const handleRename = useCallback(
    (item: FileItem) => {
      setRenameDialog({ isOpen: true, item });
    },
    []
  );

  const handleInlineRename = useCallback(
    async (item: FileItem, newName: string) => {
      const safeName = newName.replace(/[/\\?%*:|"<>]/g, "-");
      const finalName =
        !item.isFolder && !safeName.endsWith(".excalidraw")
          ? `${safeName}.excalidraw`
          : safeName;

      const parentPath = item.path.includes("/")
        ? item.path.substring(0, item.path.lastIndexOf("/"))
        : "";
      const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;

      if (item.path === newPath) return;

      try {
        await renameItem(item.path, newPath);
        onRefresh();

        if (item.isFolder && expandedFolders.has(item.path)) {
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            next.delete(item.path);
            next.add(newPath);
            return next;
          });
        }
      } catch (err) {
        alert(`名前変更に失敗しました: ${err}`);
      }
    },
    [renameItem, onRefresh, expandedFolders]
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      const { item } = renameDialog;
      setRenameDialog({ isOpen: false, item: null });
      if (!item) return;

      const safeName = newName.replace(/[/\\?%*:|"<>]/g, "-");
      const finalName =
        !item.isFolder && !safeName.endsWith(".excalidraw")
          ? `${safeName}.excalidraw`
          : safeName;

      const parentPath = item.path.includes("/")
        ? item.path.substring(0, item.path.lastIndexOf("/"))
        : "";
      const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;

      try {
        await renameItem(item.path, newPath);
        onRefresh();
      } catch (err) {
        alert(`名前変更に失敗しました: ${err}`);
      }
    },
    [renameItem, onRefresh, renameDialog]
  );

  const handleTrash = useCallback(
    (item: FileItem) => {
      setTrashConfirmDialog({ isOpen: true, item });
    },
    []
  );

  const handleTrashConfirm = useCallback(
    async () => {
      const { item } = trashConfirmDialog;
      setTrashConfirmDialog({ isOpen: false, item: null });
      if (!item) return;

      try {
        await trashItem(item.path);
        onRefresh();
        await loadTrash();
      } catch (err) {
        alert(`ゴミ箱への移動に失敗しました: ${err}`);
      }
    },
    [trashItem, onRefresh, loadTrash, trashConfirmDialog]
  );

  const handleMove = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      const fileName = sourcePath.includes("/")
        ? sourcePath.substring(sourcePath.lastIndexOf("/") + 1)
        : sourcePath;

      if (sourcePath.startsWith(targetFolderPath + "/")) {
        return;
      }

      const newPath = `${targetFolderPath}/${fileName}`;
      if (sourcePath === newPath) return;

      try {
        await renameItem(sourcePath, newPath);
        onRefresh();
        setExpandedFolders((prev) => new Set([...prev, targetFolderPath]));
      } catch (err) {
        alert(`移動に失敗しました: ${err}`);
      }
    },
    [renameItem, onRefresh]
  );

  const handleRestore = useCallback(
    async (item: TrashItem) => {
      try {
        await restoreItem(item.trashPath);
        onRefresh();
        await loadTrash();
      } catch (err) {
        alert(`復元に失敗しました: ${err}`);
      }
    },
    [restoreItem, onRefresh, loadTrash]
  );

  const handleDeletePermanently = useCallback(
    (item: TrashItem) => {
      setDeletePermanentlyDialog({ isOpen: true, item });
    },
    []
  );

  const handleDeletePermanentlyConfirm = useCallback(
    async () => {
      const { item } = deletePermanentlyDialog;
      setDeletePermanentlyDialog({ isOpen: false, item: null });
      if (!item) return;

      try {
        await deletePermanently(item.trashPath);
        await loadTrash();
      } catch (err) {
        alert(`完全な削除に失敗しました: ${err}`);
      }
    },
    [deletePermanently, loadTrash, deletePermanentlyDialog]
  );

  const handleEmptyTrash = useCallback(() => {
    if (trashItems.length === 0) return;
    setEmptyTrashDialog(true);
  }, [trashItems.length]);

  const handleEmptyTrashConfirm = useCallback(async () => {
    setEmptyTrashDialog(false);
    try {
      await emptyTrash();
      await loadTrash();
    } catch (err) {
      alert(`ゴミ箱の削除に失敗しました: ${err}`);
    }
  }, [emptyTrash, loadTrash]);

  const handleIconClick = useCallback((item: FileItem) => {
    setIconPickerState({ isOpen: true, item });
  }, []);

  const handleIconSelect = useCallback(
    async (iconName: string, color: string) => {
      const { item } = iconPickerState;
      if (!item) return;

      try {
        await setItemIcon(item.path, iconName, color);
        onRefresh();
      } catch (err) {
        alert(`アイコンの設定に失敗しました: ${err}`);
      }
    },
    [setItemIcon, onRefresh, iconPickerState]
  );

  const filterFileTree = useCallback((items: FileItem[], query: string): FileItem[] => {
    if (!query) return items;

    const lowerQuery = query.toLowerCase();
    const filtered: FileItem[] = [];

    for (const item of items) {
      const displayName = item.name.endsWith(".excalidraw")
        ? item.name.slice(0, -".excalidraw".length)
        : item.name;

      if (item.isFolder) {
        const folderMatches = displayName.toLowerCase().includes(lowerQuery);

        if (folderMatches) {
          filtered.push({
            ...item,
            children: item.children || [],
          });
        } else {
          const filteredChildren = filterFileTree(item.children || [], query);
          if (filteredChildren.length > 0) {
            filtered.push({
              ...item,
              children: filteredChildren,
            });
          }
        }
      } else {
        if (displayName.toLowerCase().includes(lowerQuery)) {
          filtered.push(item);
        }
      }
    }

    return filtered;
  }, []);

  const filteredFileTree = filterFileTree(fileTree, searchQuery);

  const handleOpenSettings = useCallback(async () => {
    setSettingsOpen(true);
    await loadBaseDirectory();
  }, [loadBaseDirectory]);

  const handleSaveSettings = useCallback(async () => {
    setSettingsOpen(false);
  }, []);

  const handleChangeBaseDir = useCallback(async () => {
    try {
      const selected = await window.electronAPI.showOpenDialog();

      if (selected) {
        alert(`選択されたフォルダ: ${selected}\n\n※現在、この機能は実装中です。`);
        setSettingsOpen(false);
      }
    } catch (err) {
      alert(`フォルダ選択に失敗しました: ${err}`);
    }
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-search">
          <Search size={16} className="sidebar-search-icon" />
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="キャンバスを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="sidebar-search-clear"
              onClick={() => setSearchQuery("")}
              title="クリア"
            >
              ×
            </button>
          )}
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-button"
            title="新規キャンバス"
            onClick={() => handleNewCanvas("")}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button"
            title="新規フォルダ"
            onClick={() => handleNewFolder("")}
          >
            <Folder size={16} />
          </button>
          <button
            className="icon-button"
            title="更新"
            onClick={onRefresh}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="icon-button"
            title="設定"
            onClick={handleOpenSettings}
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>

      <div className="sidebar-tree" onContextMenu={handleRootContextMenu} onDragOver={handleRootDragOver} onDrop={handleRootDrop}>
        {filteredFileTree.length === 0 ? (
          <div className="sidebar-empty">
            {searchQuery ? (
              <p>検索結果がありません</p>
            ) : (
              <>
                <p>キャンバスがありません</p>
                <p>右クリックまたは上部ボタンで作成</p>
              </>
            )}
          </div>
        ) : (
          filteredFileTree.map((item) => (
            <TreeNode
              key={item.path}
              item={item}
              depth={0}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectFile={onSelectFile}
              onContextMenu={handleContextMenu}
              onMove={handleMove}
              onIconClick={handleIconClick}
              onRename={handleInlineRename}
            />
          ))
        )}
      </div>

      <div className="trash-section">
        <div
          className="trash-header"
          onClick={() => setIsTrashExpanded((v) => !v)}
        >
          <span className="trash-header-icon">
            {isTrashExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <span className="trash-header-title">
            ゴミ箱{trashItems.length > 0 ? ` (${trashItems.length})` : ""}
          </span>
          {trashItems.length > 0 && (
            <button
              className="trash-empty-button"
              title="ゴミ箱を空にする"
              onClick={(e) => {
                e.stopPropagation();
                handleEmptyTrash();
              }}
            >
              空にする
            </button>
          )}
        </div>

        {isTrashExpanded && (
          <div className="trash-list">
            {trashItems.length === 0 ? (
              <div className="trash-empty-msg">ゴミ箱は空です</div>
            ) : (
              trashItems.map((item) => (
                <div
                  key={item.trashPath}
                  className="trash-item"
                  title={`元の場所: ${item.originalPath}`}
                  onContextMenu={(e) => handleTrashContextMenu(e, item)}
                >
                  <span className="trash-item-icon">
                    {item.isFolder ? <Folder size={16} /> : <File size={16} />}
                  </span>
                  <span className="trash-item-label">{item.name}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onNewCanvas={handleNewCanvas}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onTrash={handleTrash}
        />
      )}

      {trashContextMenu && (
        <TrashContextMenu
          menu={trashContextMenu}
          onClose={() => setTrashContextMenu(null)}
          onRestore={handleRestore}
          onDeletePermanently={handleDeletePermanently}
        />
      )}

      <Dialog
        isOpen={newCanvasDialog.isOpen}
        title="新規キャンバス"
        placeholder="キャンバス名を入力"
        onClose={() => setNewCanvasDialog({ isOpen: false, parentPath: "" })}
        onConfirm={handleNewCanvasConfirm}
      />

      <Dialog
        isOpen={newFolderDialog.isOpen}
        title="新規フォルダ"
        placeholder="フォルダ名を入力"
        onClose={() => setNewFolderDialog({ isOpen: false, parentPath: "" })}
        onConfirm={handleNewFolderConfirm}
      />

      <Dialog
        isOpen={renameDialog.isOpen}
        title="名前変更"
        placeholder="新しい名前を入力"
        defaultValue={
          renameDialog.item
            ? renameDialog.item.name.endsWith(".excalidraw")
              ? renameDialog.item.name.slice(0, -".excalidraw".length)
              : renameDialog.item.name
            : ""
        }
        onClose={() => setRenameDialog({ isOpen: false, item: null })}
        onConfirm={handleRenameConfirm}
      />

      <ConfirmDialog
        isOpen={trashConfirmDialog.isOpen}
        title="ゴミ箱へ移動"
        message={
          trashConfirmDialog.item
            ? `${trashConfirmDialog.item.isFolder ? "フォルダ" : "キャンバス"} "${
                trashConfirmDialog.item.name.endsWith(".excalidraw")
                  ? trashConfirmDialog.item.name.slice(0, -".excalidraw".length)
                  : trashConfirmDialog.item.name
              }" をゴミ箱へ移動しますか？`
            : ""
        }
        confirmText="移動"
        onClose={() => setTrashConfirmDialog({ isOpen: false, item: null })}
        onConfirm={handleTrashConfirm}
      />

      <ConfirmDialog
        isOpen={deletePermanentlyDialog.isOpen}
        title="完全に削除"
        message={
          deletePermanentlyDialog.item
            ? `${deletePermanentlyDialog.item.isFolder ? "フォルダ" : "キャンバス"} "${
                deletePermanentlyDialog.item.name
              }" を完全に削除しますか？この操作は元に戻せません。`
            : ""
        }
        confirmText="削除"
        variant="danger"
        onClose={() => setDeletePermanentlyDialog({ isOpen: false, item: null })}
        onConfirm={handleDeletePermanentlyConfirm}
      />

      <ConfirmDialog
        isOpen={emptyTrashDialog}
        title="ゴミ箱を空にする"
        message="ゴミ箱内のすべてのアイテムを完全に削除しますか？この操作は元に戻せません。"
        confirmText="空にする"
        variant="danger"
        onClose={() => setEmptyTrashDialog(false)}
        onConfirm={handleEmptyTrashConfirm}
      />

      {iconPickerState.isOpen && iconPickerState.item && (
        <IconPicker
          currentIcon={iconPickerState.item.icon}
          currentColor={iconPickerState.item.iconColor}
          onSelect={handleIconSelect}
          onClose={() => setIconPickerState({ isOpen: false, item: null })}
        />
      )}

      {settingsOpen && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h3 className="dialog-title">設定</h3>
              <button
                className="dialog-close"
                onClick={() => setSettingsOpen(false)}
                type="button"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="dialog-body">
              <div className="settings-content">
                <div className="settings-section">
                  <h3 className="settings-section-title">保存先フォルダ</h3>
                  <div className="settings-field">
                    <div className="settings-current-path">
                      {currentBaseDir || "読み込み中..."}
                    </div>
                    <button className="dialog-button dialog-button-confirm" onClick={handleChangeBaseDir}>
                      フォルダを変更
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="dialog-button dialog-button-cancel" onClick={() => setSettingsOpen(false)}>
                キャンセル
              </button>
              <button className="dialog-button dialog-button-confirm" onClick={handleSaveSettings}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
