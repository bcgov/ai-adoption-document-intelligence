/**
 * Helpers for the "open demos in the auto-arranged view" flow
 * (`WorkflowEditorV2Page`).
 *
 * The demo seeder stamps `metadata.arrangeOnLoad` on a config; when the
 * editor hydrates such a config it runs the same measured-width Auto-arrange
 * the top-bar button uses — ONCE, after the canvas has measured its freshly
 * mounted cards. These pure helpers isolate the two decisions (should we
 * arrange? are the cards measured yet?) so they can be unit-tested without
 * React state or xyflow render timing.
 */
import type { GraphWorkflowConfig } from "../../types/workflow";

/**
 * True when a loaded config asks the editor to auto-arrange on open.
 *
 * `metadata.arrangeOnLoad` is a presentation-only hint — not part of the
 * engine's config semantics — carried through the persisted config JSON. It
 * is absent on every user-authored workflow, so honouring it never disturbs
 * a layout a person saved; only the seeded demos set it.
 */
export function configWantsArrangeOnLoad(
  config: Pick<GraphWorkflowConfig, "metadata">,
): boolean {
  return (
    (config.metadata as { arrangeOnLoad?: boolean } | undefined)
      ?.arrangeOnLoad === true
  );
}

/** A node carrying xyflow's measured size (or the fixed-width fallback). */
interface MeasurableNode {
  measured?: { width?: number };
  width?: number;
}

/**
 * True once every node reports a positive rendered width — the signal that
 * xyflow has measured the freshly mounted cards, so a width-aware
 * Auto-arrange will read real footprints instead of falling back to the
 * default width. Empty input is "not ready" (nothing mounted yet), so the
 * caller keeps polling.
 */
export function nodesAllMeasured(nodes: readonly MeasurableNode[]): boolean {
  if (nodes.length === 0) return false;
  return nodes.every((node) => {
    const width = node.measured?.width ?? node.width;
    return typeof width === "number" && width > 0;
  });
}
