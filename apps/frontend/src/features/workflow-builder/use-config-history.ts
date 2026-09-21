/**
 * G-003 — undo/redo for the visual workflow editor.
 *
 * The editor keeps its entire authored state in one `GraphWorkflowConfig`
 * object, and every mutation — canvas, palette, settings panel, delete —
 * already funnels through a single setter. That makes a whole-config
 * snapshot stack both the simplest and the most complete implementation:
 * anything an edit can change, an undo can restore, including the `config.ctx`
 * declarations that node deletion prunes (G-002).
 *
 * **The two-setter split is the design.** `setConfig` records a history entry;
 * `resetConfig` replaces the present without recording one. Lifecycle updates
 * — initial load, server hydration after an agent write or a save, auto-layout
 * — go through `resetConfig`, so undo never walks backwards through hydration.
 *
 * `resetConfig` deliberately does NOT clear the existing stack. A save
 * re-baselines and triggers a refetch → re-hydration; wiping history there
 * would mean "saving your work loses your undo history", which is the class of
 * bug this hook exists to remove.
 *
 * No history library — see the standing no-install rule. There is nothing here
 * a dependency would do better.
 */
import { useCallback, useMemo, useState } from "react";
import type { GraphWorkflowConfig } from "../../types/workflow";

/**
 * How many prior configs we retain. A graph config is an arbitrarily large
 * object and an editing session can run for hours, so an unbounded stack is a
 * memory leak; 50 steps is far more than anyone reaches for in practice.
 */
export const CONFIG_HISTORY_LIMIT = 50;

interface ConfigHistoryState {
  /** Oldest first. The entry at the end is what a single undo restores. */
  past: GraphWorkflowConfig[];
  present: GraphWorkflowConfig;
  /** Newest first — `future[0]` is what a single redo restores. */
  future: GraphWorkflowConfig[];
}

export interface ConfigHistory {
  config: GraphWorkflowConfig;
  /** Records an undo step. Use for every author-initiated edit. */
  setConfig: (
    updater:
      | GraphWorkflowConfig
      | ((prev: GraphWorkflowConfig) => GraphWorkflowConfig),
  ) => void;
  /**
   * Replaces state WITHOUT recording history — initial load, server
   * hydration, save re-baselining, auto-layout.
   */
  resetConfig: (next: GraphWorkflowConfig) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useConfigHistory(
  initial: GraphWorkflowConfig | (() => GraphWorkflowConfig),
): ConfigHistory {
  const [state, setState] = useState<ConfigHistoryState>(() => ({
    past: [],
    present: typeof initial === "function" ? initial() : initial,
    future: [],
  }));

  const setConfig = useCallback(
    (
      updater:
        | GraphWorkflowConfig
        | ((prev: GraphWorkflowConfig) => GraphWorkflowConfig),
    ) => {
      setState((prev) => {
        const next =
          typeof updater === "function" ? updater(prev.present) : updater;
        // Reference-identical means nothing changed: React state updates
        // always produce a fresh object for a real edit, and `prev => prev` is
        // the idiomatic "no change" return. Cheap, and it keeps the stack free
        // of entries that would make undo appear to do nothing.
        if (next === prev.present) return prev;
        const past =
          prev.past.length >= CONFIG_HISTORY_LIMIT
            ? [...prev.past.slice(prev.past.length - CONFIG_HISTORY_LIMIT + 1)]
            : [...prev.past];
        past.push(prev.present);
        return { past, present: next, future: [] };
      });
    },
    [],
  );

  const resetConfig = useCallback((next: GraphWorkflowConfig) => {
    setState((prev) =>
      prev.present === next ? prev : { ...prev, present: next },
    );
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const past = prev.past.slice(0, -1);
      const present = prev.past[prev.past.length - 1];
      return { past, present, future: [prev.present, ...prev.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const [present, ...future] = prev.future;
      return { past: [...prev.past, prev.present], present, future };
    });
  }, []);

  return useMemo(
    () => ({
      config: state.present,
      setConfig,
      resetConfig,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, setConfig, resetConfig, undo, redo],
  );
}
