/**
 * Re-exports shared graph insertion-slot helpers from `@ai-di/graph-insertion-slots`.
 * `GraphWorkflowConfig` is structurally compatible with the package's minimal graph type.
 */

import type { InsertionSlot } from "@ai-di/graph-insertion-slots";

export * from "@ai-di/graph-insertion-slots";

/** Shape passed to AI recommendation / pipeline (edge id omitted). */
export type InsertionSlotSummaryPayload = Pick<
  InsertionSlot,
  | "slotIndex"
  | "afterNodeId"
  | "beforeNodeId"
  | "afterActivityType"
  | "beforeActivityType"
>;

/** Maps graph insertion slots to the workflow summary field (shared with AI recommendation). */
export function insertionSlotsToSummary(
  slots: InsertionSlot[],
): InsertionSlotSummaryPayload[] {
  return slots.map(
    ({
      slotIndex,
      afterNodeId,
      beforeNodeId,
      afterActivityType,
      beforeActivityType,
    }) => ({
      slotIndex,
      afterNodeId,
      beforeNodeId,
      afterActivityType,
      beforeActivityType,
    }),
  );
}
