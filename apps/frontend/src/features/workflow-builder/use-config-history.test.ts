/**
 * G-003 — undo/redo over the editor's single `config` state.
 *
 * The hook is the whole feature: the page already funnels every mutation
 * through one setter, so wrapping that setter is all it takes. What these
 * tests pin is the part that is easy to get wrong — the split between
 * `setConfig` (records history) and `resetConfig` (does not), which is what
 * keeps initial load / server hydration / auto-layout out of the undo stack.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../types/workflow";
import { CONFIG_HISTORY_LIMIT, useConfigHistory } from "./use-config-history";

function cfg(name: string): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    ctx: {},
    nodes: {},
    edges: [],
    entryNodeId: "",
  } as GraphWorkflowConfig;
}

describe("useConfigHistory", () => {
  it("starts with nothing to undo or redo", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    expect(result.current.config.metadata.name).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("accepts a lazy initialiser, like useState", () => {
    const { result } = renderHook(() => useConfigHistory(() => cfg("lazy")));
    expect(result.current.config.metadata.name).toBe("lazy");
  });

  it("undoes a single edit back to the previous config", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.setConfig(cfg("b")));
    expect(result.current.config.metadata.name).toBe("b");
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.config.metadata.name).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("supports an updater function like useState", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() =>
      result.current.setConfig((prev) => ({
        ...prev,
        metadata: { ...prev.metadata, name: `${prev.metadata.name}!` },
      })),
    );
    expect(result.current.config.metadata.name).toBe("a!");
  });

  it("redoes an undone edit", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.setConfig(cfg("b")));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.config.metadata.name).toBe("b");
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it("walks back through several edits in order", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.setConfig(cfg("b")));
    act(() => result.current.setConfig(cfg("c")));
    act(() => result.current.undo());
    expect(result.current.config.metadata.name).toBe("b");
    act(() => result.current.undo());
    expect(result.current.config.metadata.name).toBe("a");
    expect(result.current.canUndo).toBe(false);
  });

  it("clears the redo stack when a new edit follows an undo", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.setConfig(cfg("b")));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.setConfig(cfg("c")));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.config.metadata.name).toBe("c");
  });

  it("does nothing when asked to undo or redo an empty stack", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.config.metadata.name).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("does not record a lifecycle reset as an undo step", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.resetConfig(cfg("hydrated")));
    expect(result.current.config.metadata.name).toBe("hydrated");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("a lifecycle reset leaves the user's existing undo stack intact", () => {
    // Save → server refetch → re-hydrate must not wipe what the author can
    // still undo. The reset replaces the present, nothing else.
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    act(() => result.current.setConfig(cfg("b")));
    act(() => result.current.resetConfig(cfg("server")));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.config.metadata.name).toBe("a");
    act(() => result.current.redo());
    expect(result.current.config.metadata.name).toBe("server");
  });

  it("caps history at a bounded depth and drops the oldest", () => {
    const { result } = renderHook(() => useConfigHistory(cfg("gen-0")));
    act(() => {
      for (let i = 1; i <= CONFIG_HISTORY_LIMIT + 5; i++) {
        result.current.setConfig(cfg(`gen-${i}`));
      }
    });
    // Undo as far as the stack allows.
    act(() => {
      for (let i = 0; i < CONFIG_HISTORY_LIMIT + 10; i++) result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    // The oldest generations fell off the bottom, so the deepest reachable
    // state is the one exactly CONFIG_HISTORY_LIMIT steps back.
    const deepest = CONFIG_HISTORY_LIMIT + 5 - CONFIG_HISTORY_LIMIT;
    expect(result.current.config.metadata.name).toBe(`gen-${deepest}`);
  });

  it("treats an identical config as a no-op rather than a history entry", () => {
    const initial = cfg("a");
    const { result } = renderHook(() => useConfigHistory(initial));
    act(() => result.current.setConfig(initial));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.setConfig((prev) => prev));
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps setConfig / resetConfig / undo / redo referentially stable", () => {
    // The page passes these straight to child props and effect deps; churn
    // would re-render the canvas on every keystroke.
    const { result } = renderHook(() => useConfigHistory(cfg("a")));
    const first = {
      setConfig: result.current.setConfig,
      resetConfig: result.current.resetConfig,
      undo: result.current.undo,
      redo: result.current.redo,
    };
    act(() => result.current.setConfig(cfg("b")));
    expect(result.current.setConfig).toBe(first.setConfig);
    expect(result.current.resetConfig).toBe(first.resetConfig);
    expect(result.current.undo).toBe(first.undo);
    expect(result.current.redo).toBe(first.redo);
  });

  it("restores ctx declarations that an edit pruned", () => {
    // The crux of the delete-toast conversion: node deletion prunes orphaned
    // `config.ctx` declarations, so undo has to bring the declarations back
    // with the node. Whole-config snapshots give this for free — pinned here
    // so a future move to per-field diffs can't silently regress it.
    const before: GraphWorkflowConfig = {
      ...cfg("a"),
      ctx: { preparedFile: { type: "object" } },
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
        },
      },
      entryNodeId: "prep",
    } as GraphWorkflowConfig;
    const after: GraphWorkflowConfig = {
      ...cfg("a"),
      ctx: {},
      nodes: {},
      entryNodeId: "",
    } as GraphWorkflowConfig;

    const { result } = renderHook(() => useConfigHistory(before));
    act(() => result.current.setConfig(after));
    expect(result.current.config.ctx.preparedFile).toBeUndefined();

    act(() => result.current.undo());
    expect(result.current.config.nodes.prep).toBeDefined();
    expect(result.current.config.ctx.preparedFile).toEqual({ type: "object" });
  });
});
