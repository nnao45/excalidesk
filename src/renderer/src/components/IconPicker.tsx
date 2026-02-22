import { useEffect, useRef, useState } from "react";
import {
  X,
  File,
  FileText,
  Image,
  Video,
  Music,
  Code,
  Database,
  Folder,
  Archive,
  FileJson,
  Table,
  BookOpen,
  Newspaper,
  Palette,
  Briefcase,
  ShoppingCart,
  Heart,
  Star,
  Zap,
  Trophy,
  Target,
  Flag,
  Bell,
  Calendar,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
  Home,
  Building,
  Globe,
  Map,
  Settings,
  Wrench,
  Package,
  Box,
  Gift,
  Coffee,
  Lightbulb,
  Flame,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

interface IconPickerProps {
  currentIcon?: string;
  currentColor?: string;
  onClose: () => void;
  onSelect: (iconName: string, color: string) => void;
}

interface IconCategory {
  name: string;
  icons: { name: string; Icon: LucideIcon }[];
}

const COLORS = [
  { name: "デフォルト", value: "default" },
  { name: "レッド", value: "#f38ba8" },
  { name: "オレンジ", value: "#fab387" },
  { name: "イエロー", value: "#f9e2af" },
  { name: "グリーン", value: "#a6e3a1" },
  { name: "ブルー", value: "#89b4fa" },
  { name: "パープル", value: "#cba6f7" },
];

const iconCategories: IconCategory[] = [
  {
    name: "ファイル",
    icons: [
      { name: "File", Icon: File },
      { name: "FileText", Icon: FileText },
      { name: "Image", Icon: Image },
      { name: "Video", Icon: Video },
      { name: "Music", Icon: Music },
      { name: "Code", Icon: Code },
      { name: "Database", Icon: Database },
      { name: "Archive", Icon: Archive },
      { name: "FileJson", Icon: FileJson },
      { name: "Table", Icon: Table },
    ],
  },
  {
    name: "ドキュメント",
    icons: [
      { name: "BookOpen", Icon: BookOpen },
      { name: "Newspaper", Icon: Newspaper },
      { name: "Palette", Icon: Palette },
      { name: "Briefcase", Icon: Briefcase },
    ],
  },
  {
    name: "マーク",
    icons: [
      { name: "Heart", Icon: Heart },
      { name: "Star", Icon: Star },
      { name: "Zap", Icon: Zap },
      { name: "Trophy", Icon: Trophy },
      { name: "Target", Icon: Target },
      { name: "Flag", Icon: Flag },
      { name: "Sparkles", Icon: Sparkles },
      { name: "Flame", Icon: Flame },
    ],
  },
  {
    name: "コミュニケーション",
    icons: [
      { name: "Bell", Icon: Bell },
      { name: "Mail", Icon: Mail },
      { name: "MessageSquare", Icon: MessageSquare },
      { name: "Phone", Icon: Phone },
    ],
  },
  {
    name: "時間・場所",
    icons: [
      { name: "Calendar", Icon: Calendar },
      { name: "Clock", Icon: Clock },
      { name: "Home", Icon: Home },
      { name: "Building", Icon: Building },
      { name: "Globe", Icon: Globe },
      { name: "Map", Icon: Map },
    ],
  },
  {
    name: "その他",
    icons: [
      { name: "User", Icon: User },
      { name: "Users", Icon: Users },
      { name: "Settings", Icon: Settings },
      { name: "Wrench", Icon: Wrench },
      { name: "Package", Icon: Package },
      { name: "Box", Icon: Box },
      { name: "Gift", Icon: Gift },
      { name: "ShoppingCart", Icon: ShoppingCart },
      { name: "Coffee", Icon: Coffee },
      { name: "Lightbulb", Icon: Lightbulb },
      { name: "Folder", Icon: Folder },
    ],
  },
];

export function IconPicker({ currentIcon, currentColor, onClose, onSelect }: IconPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [selectedColor, setSelectedColor] = useState(currentColor || "default");

  useEffect(() => {
    setSelectedColor(currentColor || "default");
  }, [currentColor]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const getIconColor = (colorValue: string) => {
    return colorValue === "default" ? undefined : colorValue;
  };

  return (
    <div className="icon-picker-overlay">
      <div className="icon-picker" ref={pickerRef}>
        <div className="icon-picker-header">
          <h3 className="icon-picker-title">アイコンを選択</h3>
          <button
            className="icon-picker-close"
            onClick={onClose}
            type="button"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="icon-picker-colors">
          {COLORS.map((color) => (
            <button
              key={color.value}
              className={`icon-picker-color ${selectedColor === color.value ? "active" : ""}`}
              onClick={() => setSelectedColor(color.value)}
              title={color.name}
              style={{
                backgroundColor: color.value === "default" ? "transparent" : color.value,
                border: color.value === "default" ? "1px solid var(--color-border)" : "none",
              }}
            >
              {color.value === "default" && "×"}
            </button>
          ))}
        </div>

        <div className="icon-picker-categories">
          {iconCategories.map((category, index) => (
            <button
              key={category.name}
              className={`icon-picker-category ${selectedCategory === index ? "active" : ""}`}
              onClick={() => setSelectedCategory(index)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="icon-picker-grid">
          {iconCategories[selectedCategory].icons.map(({ name, Icon }) => (
            <button
              key={name}
              className={`icon-picker-item ${currentIcon === name ? "selected" : ""}`}
              onClick={() => {
                onSelect(name, selectedColor);
                onClose();
              }}
              title={name}
            >
              <Icon size={24} style={{ color: getIconColor(selectedColor) }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
