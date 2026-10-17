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
 * **Text fields are off limits — but only text fields.** Ctrl+Z inside a text
 * box is the browser's own text undo, and every settings field in the feature
 * depends on it, so we bail before `preventDefault` and the native behaviour
 * survives untouched. "Text box" means an editable `<textarea>`, an editable
 * `<input>` of a text-entry type, or a contenteditable host — nothing wider.
 * A tag-name check is too wide: a radio, a checkbox or a switch is an `<input>`
 * with no text and therefore no undo stack of its own, so bailing there just
 * loses the keystroke (Inderdeep Singh's UX walkthrough, 2026-08-06, item 1).
 */
import { useEffect } from "react";

export interface UndoRedoHotkeyOptions {
  undo: () => void;
  redo: () => void;
  /** Set false to unbind (e.g. while a blocking modal owns the keyboard). */
  enabled?: boolean;
}

/**
 * The `<input>` types the browser keeps a text-editing undo stack for — the
 * ones you type free text into. Enumerated rather than blacklisted, because
 * the set of non-text types keeps growing and the safe default for an unknown
 * control is "not a text box".
 *
 * Deliberately excluded: `radio`, `checkbox`, `range`, `color`, `file`,
 * `hidden` and the button types (`button`, `submit`, `reset`, `image`), which
 * hold no editable text at all; and the date/time family (`date`,
 * `datetime-local`, `month`, `time`, `week`), which edits fixed segments
 * through a picker rather than a text buffer and has no native undo either.
 *
 * `radio` is the one that caused the bug: Mantine's `SegmentedControl` — the
 * error-handling chooser in the settings drawer — renders each option as a
 * hidden `<input type="radio">` behind its label, so clicking an option leaves
 * an INPUT focused and every subsequent Ctrl/Cmd+Z was swallowed.
 */
const TEXT_ENTRY_INPUT_TYPES: ReadonlySet<string> = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

/**
 * True when the event target is somewhere the user is typing, and the
 * keystroke therefore belongs to the browser's native text undo rather than to
 * the graph.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  // A read-only field holds text but cannot be edited, so there is no native
  // undo stack to protect. Mantine renders a non-searchable `Select` as
  // exactly that — a read-only text input — and it must not swallow undo.
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (target instanceof HTMLInputElement) {
    // `.type` is the parsed property rather than the raw attribute, so a
    // missing or unrecognised type reads back as "text" — which is what the
    // browser actually renders.
    return TEXT_ENTRY_INPUT_TYPES.has(target.type) && !target.readOnly;
  }
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
