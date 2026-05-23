/**
 * Shared visual hints for the six control-flow node types.
 *
 * Both the palette (`ActivityPalette`) and the canvas
 * (`WorkflowEditorCanvas`) need to render the same icon + accent colour
 * for switch / map / join / childWorkflow / pollUntil / humanGate. This
 * module is the single source of truth so the two surfaces never drift.
 *
 * - `iconHint` is the same string the palette catalog uses.
 * - `Icon` is the Tabler React component the palette already maps to
 *   (kept here so the canvas doesn't have to re-derive the mapping).
 * - `color` is the accent colour rendered on the node border + handles.
 * - `shape` is the geometric form the canvas should render: `diamond`
 *   for `switch`, `rectangle` for the rest.
 * - `fanIndicator` is the secondary overlay icon for map (fan-out) and
 *   join (fan-in); absent for the other types.
 */

import {
  IconArrowMerge,
  IconArrowsSplit,
  IconExternalLink,
  IconHandStop,
  IconRefresh,
  IconRoute,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { ControlFlowNodeType } from "./palette/control-flow-skeletons";

export interface TablerIconProps {
  size?: number | string;
}

export type ControlFlowShape = "diamond" | "rectangle";

export interface ControlFlowVisualHints {
  type: ControlFlowNodeType;
  displayName: string;
  iconHint: string;
  Icon: ComponentType<TablerIconProps>;
  color: string;
  shape: ControlFlowShape;
  /** Secondary overlay icon for map (fan-out) and join (fan-in). */
  fanIndicator?: ComponentType<TablerIconProps>;
  /** Short label for the fan-indicator tooltip. */
  fanIndicatorLabel?: string;
}

const HINTS: Record<ControlFlowNodeType, ControlFlowVisualHints> = {
  switch: {
    type: "switch",
    displayName: "Branch by condition",
    iconHint: "switch",
    Icon: IconRoute,
    color: "#facc15",
    shape: "diamond",
  },
  map: {
    type: "map",
    displayName: "Run for each item",
    iconHint: "map",
    Icon: IconArrowsSplit,
    color: "#22c55e",
    shape: "rectangle",
    fanIndicator: IconArrowsSplit,
    fanIndicatorLabel: "fan-out",
  },
  join: {
    type: "join",
    displayName: "Collect results",
    iconHint: "join",
    Icon: IconArrowMerge,
    color: "#16a34a",
    shape: "rectangle",
    fanIndicator: IconArrowMerge,
    fanIndicatorLabel: "fan-in",
  },
  childWorkflow: {
    type: "childWorkflow",
    displayName: "Sub-workflow",
    iconHint: "childWorkflow",
    Icon: IconExternalLink,
    color: "#a855f7",
    shape: "rectangle",
  },
  pollUntil: {
    type: "pollUntil",
    displayName: "Wait until condition",
    iconHint: "pollUntil",
    Icon: IconRefresh,
    color: "#fb923c",
    shape: "rectangle",
  },
  humanGate: {
    type: "humanGate",
    displayName: "Wait for approval",
    iconHint: "humanGate",
    Icon: IconHandStop,
    color: "#ef4444",
    shape: "rectangle",
  },
};

export function getControlFlowVisualHints(
  type: ControlFlowNodeType,
): ControlFlowVisualHints {
  return HINTS[type];
}

export const CONTROL_FLOW_VISUAL_HINTS: ReadonlyArray<ControlFlowVisualHints> =
  Object.values(HINTS);
