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
 * - `color` is the accent colour rendered on the node border + handles. It
 *   comes from `node-accents.ts` and names a ROLE, not a type: `switch` and
 *   `pollUntil` share the routing accent, `map` and `join` share the fan
 *   accent. Six types, four accents — see that file for the measurement that
 *   forced the reduction (item 20).
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
import { nodeAccent } from "./node-accents";
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
    color: nodeAccent("routing"),
    shape: "diamond",
  },
  map: {
    type: "map",
    displayName: "Run for each item",
    iconHint: "map",
    Icon: IconArrowsSplit,
    color: nodeAccent("fan"),
    shape: "rectangle",
    fanIndicator: IconArrowsSplit,
    fanIndicatorLabel: "fan-out",
  },
  join: {
    type: "join",
    displayName: "Collect results",
    iconHint: "join",
    Icon: IconArrowMerge,
    color: nodeAccent("fan"),
    shape: "rectangle",
    fanIndicator: IconArrowMerge,
    fanIndicatorLabel: "fan-in",
  },
  childWorkflow: {
    type: "childWorkflow",
    displayName: "Sub-workflow",
    iconHint: "childWorkflow",
    Icon: IconExternalLink,
    color: nodeAccent("childWorkflow"),
    shape: "rectangle",
  },
  pollUntil: {
    type: "pollUntil",
    displayName: "Wait until condition",
    iconHint: "pollUntil",
    Icon: IconRefresh,
    color: nodeAccent("routing"),
    shape: "rectangle",
  },
  humanGate: {
    type: "humanGate",
    displayName: "Wait for approval",
    iconHint: "humanGate",
    Icon: IconHandStop,
    color: nodeAccent("person"),
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
