/**
 * Hard-coded palette entries for the six control-flow node types.
 *
 * Control-flow nodes are NOT activities and intentionally do not live in
 * `ACTIVITY_CATALOG`. The palette renders this list as a dedicated
 * "Flow Control" section above the activity categories so authors can
 * insert switch / map / join / childWorkflow / pollUntil / humanGate
 * skeletons without dropping to the JSON editor.
 *
 * Each entry carries an `iconHint` (mapped to a Tabler icon by
 * `ActivityPalette`) plus the display name and short description shown
 * on hover.
 */

import type { NodeType } from "../../../types/workflow";

export interface ControlFlowPaletteEntry {
  /** The discriminator written to `node.type` when this entry is added. */
  type: Exclude<NodeType, "activity" | "source">;
  /** Short, user-friendly name shown in the palette row. */
  displayName: string;
  /** Tooltip / hover description explaining what the node does. */
  description: string;
  /** Lookup key into the palette's Tabler icon map. */
  iconHint: string;
}

export const CONTROL_FLOW_PALETTE_ENTRIES: ControlFlowPaletteEntry[] = [
  {
    type: "switch",
    displayName: "Branch by condition",
    description:
      "Route execution down one of several branches based on conditions over ctx values.",
    iconHint: "switch",
  },
  {
    type: "map",
    displayName: "Run for each item",
    description:
      "Run a sub-graph once per item in a ctx collection, with optional bounded concurrency.",
    iconHint: "map",
  },
  {
    type: "join",
    displayName: "Collect results",
    description:
      "Wait for the iterations of a Map node to complete and collect their results into ctx.",
    iconHint: "join",
  },
  {
    type: "childWorkflow",
    displayName: "Sub-workflow",
    description:
      "Invoke another workflow from the library (or an inline graph) with mapped inputs and outputs.",
    iconHint: "childWorkflow",
  },
  {
    type: "pollUntil",
    displayName: "Wait until condition",
    description:
      "Repeatedly run an activity until a condition over its result is satisfied.",
    iconHint: "pollUntil",
  },
  {
    type: "humanGate",
    displayName: "Wait for approval",
    description:
      "Pause the workflow until a human signal arrives, with a timeout fallback policy.",
    iconHint: "humanGate",
  },
];
