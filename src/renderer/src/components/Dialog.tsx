import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface DialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

export function Dialog({
  isOpen,
  title,
  onClose,
  onConfirm,
  defaultValue = "",
  placeholder = "",
  confirmText = "OK",
  cancelText = "キャンセル",
}: DialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog" ref={dialogRef}>
        <div className="dialog-header">
          <h3 className="dialog-title">{title}</h3>
          <button
            className="dialog-close"
            onClick={onClose}
            type="button"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            <input
              ref={inputRef}
              type="text"
              className="dialog-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
            />
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              className="dialog-button dialog-button-cancel"
              onClick={onClose}
            >
              {cancelText}
            </button>
            <button
              type="submit"
              className="dialog-button dialog-button-confirm"
              disabled={!value.trim()}
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = "OK",
  cancelText = "キャンセル",
  variant = "default",
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog" ref={dialogRef}>
        <div className="dialog-header">
          <h3 className="dialog-title">{title}</h3>
          <button
            className="dialog-close"
            onClick={onClose}
            type="button"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">
          <p className="dialog-message">{message}</p>
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="dialog-button dialog-button-cancel"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`dialog-button dialog-button-confirm ${variant === "danger" ? "dialog-button-danger" : ""}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
