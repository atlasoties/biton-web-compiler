// Small, accessible dialogs used for the file actions (new file, rename, …).
// They replace the browser's prompt()/confirm(), which cannot be themed and
// look out of place in the rest of the app.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button, IconButton, cx } from "./ui";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
}

function Dialog({ title, description, children, onClose }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const target = dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog;
    target?.focus();
    return () => restoreFocus.current?.focus?.();
  }, []);

  // Stop the page and the editor shortcuts underneath from scrolling or
  // reacting while the dialog is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Capture Escape and app-wide shortcuts before they reach the handlers
  // underneath (Escape there cancels a running program, Ctrl+Enter runs it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--overlay)] backdrop-blur-[2px] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-[400px] bg-surface border border-line rounded-xl shadow-pop p-5 text-fg outline-none animate-pop"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-[12.5px] text-muted mt-1 leading-relaxed break-words">
                {description}
              </div>
            )}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-1.5 -mt-1">
            <X className="w-4 h-4" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface PromptDialogProps {
  title: string;
  description?: ReactNode;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Return an error message to keep the dialog open. */
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
  /** Select the part before the extension, like a rename field usually does. */
  selectBasename?: boolean;
}

export function PromptDialog({
  title,
  description,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "Create",
  validate,
  onConfirm,
  onClose,
  selectBasename = false,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (selectBasename) {
      const dot = initialValue.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
    } else if (initialValue.endsWith("/")) {
      // A prefilled folder path: keep it and let the user type the name after it.
      input.setSelectionRange(initialValue.length, initialValue.length);
    } else {
      input.select();
    }
  }, [initialValue, selectBasename]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    const message = validate?.(trimmed) ?? null;
    if (message) {
      setError(message);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog title={title} description={description} onClose={onClose}>
      <form onSubmit={submit} noValidate className="mt-4">
        <label htmlFor={inputId} className="block text-[12.5px] font-medium text-muted mb-1.5">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          data-autofocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cx(
            "w-full h-10 bg-surface border rounded-md px-3 font-mono text-[13px] text-fg placeholder:text-faint outline-none focus:ring-2",
            error
              ? "border-danger focus:border-danger focus:ring-danger-soft"
              : "border-line-strong focus:border-accent focus:ring-accent-soft",
          )}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-[12px] text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** An optional third choice between Cancel and the confirm button. */
  alternative?: { label: string; onSelect: () => void };
}

export function ConfirmDialog({ title, description, confirmLabel = "Delete", destructive = false, onConfirm, onClose, alternative }: ConfirmDialogProps) {
  return (
    <Dialog title={title} description={description} onClose={onClose}>
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button data-autofocus onClick={onClose}>
          Cancel
        </Button>
        {alternative && <Button onClick={alternative.onSelect}>{alternative.label}</Button>}
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
