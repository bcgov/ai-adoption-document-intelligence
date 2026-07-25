/**
 * G-003 — Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z / Ctrl+Y (redo) for the
 * workflow editor. This is the first keyboard shortcut in the feature; there
 * was no hotkey infrastructure to reuse and none is installed (see the
 * standing no-install rule), so it is a plain `keydown` listener.
 *
 * **Scope.** The listener lives on `window` but is mounted only while the
 * editor page is mounted, which is what "scoped to the editor" means here —
 * the editor owns the whole viewport.
 *
 * **Text fields are off limits.** Ctrl+Z inside an input / textarea /
 * contenteditable is the browser's own text undo, and every settings field in
 * the feature depends on it. We bail before `preventDefault` so the native
 * behaviour survives untouched.
 */
import { useEffect } from "react";

export interface UndoRedoHotkeyOptions {
  undo: () => void;
  redo: () => void;
  /** Set false to unbind (e.g. while a blocking modal owns the keyboard). */
  enabled?: boolean;
}

/**
 * True when the event target is somewhere the user is typing, and the
 * keystroke therefore belongs to the browser's native text undo rather than to
 * the graph.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  // `isContentEditable` is not implemented in jsdom, and in real browsers it
  // is the authoritative signal — checking the attribute as well keeps the
  // guard honest under test AND covers nested markup inside a rich-text host.
  return (
    target.closest('[contenteditable=""],[contenteditable="true"]') !== null
  );
}

export function useUndoRedoHotkeys({
  undo,
  redo,
  enabled = true,
}: UndoRedoHotkeyOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey) return;
      if (isTextEntryTarget(event.target)) return;
      // Browsers report the shifted key as "Z"; normalise before comparing.
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, enabled]);
}
