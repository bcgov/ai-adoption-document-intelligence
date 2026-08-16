/**
 * `useDebouncedTextCommit` — local draft state for a text field whose commit is
 * expensive, with the echo guard that makes a controlled field safe to draft.
 *
 * **Why (D7).** Every node-settings text field was fully controlled by the
 * editor's page-level config: one keystroke wrote a whole new
 * `GraphWorkflowConfig`, which re-ran the auto-wire resolver over every typed
 * input port on every node (an upstream graph walk per port), rewrote
 * downstream input bindings, changed the canvas's structural fingerprint, and
 * re-projected every card — allocating a fresh object per node, which defeats
 * xyflow's identity reuse so every node component re-rendered. Typing lagged
 * behind the keyboard. The field keeps its own draft now and commits once per
 * editing burst instead of once per character.
 *
 * **The echo guard is not optional.** A controlled field that also holds a
 * draft has two writers, and the parent's value arrives *late* — it is the
 * draft coming back through the parent's state. Re-seeding the draft from that
 * echo overwrites whatever was typed in the meantime; in the Monaco editor the
 * same shape lost characters and threw the caret to the end of the document
 * (D8). `lastSyncedRef` records the value we emitted *before* the parent can
 * echo it, so an echo is always recognised and only a genuine external change
 * (an undo, an agent write, a hydration) re-seeds the draft.
 *
 * The pending commit is flushed on blur and on unmount, so navigating away
 * mid-burst cannot silently drop what was typed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Default quiet period before a draft is committed to the parent. */
export const TEXT_COMMIT_DEBOUNCE_MS = 250;

export interface DebouncedTextCommit {
  /** What the input should render. Updates on every keystroke. */
  draft: string;
  /** Record a keystroke and (re)start the debounce. */
  setDraft: (next: string) => void;
  /** Set and commit in one go — for a discrete choice, e.g. picking an option. */
  commit: (next: string) => void;
  /** Commit whatever is pending right now. A no-op when nothing is pending. */
  flush: () => void;
}

export function useDebouncedTextCommit(
  value: string,
  onChange: (next: string) => void,
  debounceMs: number = TEXT_COMMIT_DEBOUNCE_MS,
): DebouncedTextCommit {
  const [draft, setDraftState] = useState(value);
  const draftRef = useRef(value);
  /**
   * The last value this hook either emitted upwards or accepted from above.
   * Anything equal to it that arrives as `value` is our own echo.
   */
  const lastSyncedRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    cancel();
    const next = draftRef.current;
    if (next === lastSyncedRef.current) return;
    lastSyncedRef.current = next;
    onChangeRef.current(next);
  }, [cancel]);

  const setDraft = useCallback(
    (next: string) => {
      draftRef.current = next;
      setDraftState(next);
      cancel();
      timerRef.current = setTimeout(flush, debounceMs);
    },
    [cancel, flush, debounceMs],
  );

  const commit = useCallback(
    (next: string) => {
      draftRef.current = next;
      setDraftState(next);
      flush();
    },
    [flush],
  );

  // Genuine external changes only — an undo, an agent write, a hydration, or
  // the parent normalising what we sent. Our own echo is filtered out above.
  useEffect(() => {
    if (value === lastSyncedRef.current) return;
    lastSyncedRef.current = value;
    draftRef.current = value;
    setDraftState(value);
    cancel();
  }, [value, cancel]);

  // Backstop for the case blur cannot cover: the field is unmounted while a
  // commit is still pending (selecting another node tears the panel down).
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  return { draft, setDraft, commit, flush };
}
