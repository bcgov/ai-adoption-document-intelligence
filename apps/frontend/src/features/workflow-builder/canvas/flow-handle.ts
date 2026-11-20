/**
 * The node-level RUN-ORDER handles — one definition of the dot every card
 * hangs its "runs after" wire on.
 *
 * Every card renders two of these: an unnamed left target and the `id="out"`
 * right source. They are what a `normal`/`conditional` edge attaches to, and
 * dragging between two of them is how execution order is authored by hand.
 *
 * The dot is drawn one way on every card (`ActivityNodeRenderer` and
 * `NodeHandles` alike), because any difference between cards reads as
 * meaning:
 *
 *   - **Position.** `FLOW_HANDLE_TOP` on every rectangular card. xyflow's
 *     default, `top: 50%`, would put the pair at a different height on every
 *     card, since cards differ in height.
 *   - **Fill.** Not a data-port colour: `portDotColor("gray")` is the
 *     **wildcard DATA port** colour, and `portShapeStyle`'s `gray` family is
 *     the HOLLOW silhouette, so either would make the dot look like a data
 *     port.
 *   - **Hover text.** One sentence, about order: the connector carries no
 *     data, so a sentence about typed inputs or outputs would describe the
 *     wrong thing.
 *
 * So: one geometry, one fill, one sentence. The fill is `SEQUENCE_STROKE`,
 * the exact grey of the dashed wire the dot emits, so the connector and the
 * line it draws are visibly the same thing — and it is a grey no port family
 * uses, so a run-order dot cannot be mistaken for a wildcard port.
 */

import type { CSSProperties } from "react";

import { SEQUENCE_STROKE } from "./WorkflowEdge";

/**
 * Distance from the card's top edge to the centre of the run-order dots on
 * every RECTANGULAR card. Chosen as the value the activity card already
 * used, so the common case is unchanged; the control-flow rectangles move up
 * to meet it.
 */
export const FLOW_HANDLE_TOP = 18;

/**
 * Fill for both dots. `SEQUENCE_STROKE` is the dashed "Runs after" wire's
 * own grey (`#9CA3AF`), shared rather than re-picked — the legend samples
 * the same constant.
 */
export const FLOW_HANDLE_COLOR = SEQUENCE_STROKE;

/**
 * Hover copy. Both sentences name the concept in the legend's words ("Runs
 * after — order only, no data") and then say out loud that the dot is
 * draggable, and that dragging it is how run order is authored.
 */
export const FLOW_HANDLE_TOOLTIP_IN =
  "Runs after — drop a wire here to make this step run after another. Order only, no data.";
export const FLOW_HANDLE_TOOLTIP_OUT =
  "Runs after — drag from here to another step's matching dot to make it run after this one. Order only, no data.";

/**
 * Where the pair sits vertically.
 *
 *   - `"card-top"` — every rectangular card (activity, pollUntil, map, join,
 *     childWorkflow, humanGate). A constant band across the whole canvas.
 *   - `"middle"` — the switch DIAMOND only, where the left and right
 *     vertices ARE the vertical midpoint: a rotated square has no top-left
 *     corner to pin to, so `top: 18px` would float the dot off the shape.
 *     This is the one position difference that carries a reason, and it is
 *     forced by geometry rather than chosen.
 */
export type FlowHandleAnchor = "card-top" | "middle";

/**
 * Inline style for one run-order handle. The 12×12 size and the
 * body-coloured ring come from `.wb-editor-canvas .react-flow__handle` in
 * `workflow-editor-canvas.css`; only fill and vertical anchor are set here.
 *
 * `top` is expressed the way xyflow expects for each anchor — a pixel offset
 * or `50%` — because xyflow's own `.react-flow__handle-left/-right` classes
 * apply `translate(±50%, -50%)`, which centres the dot on whatever `top`
 * resolves to.
 */
export function flowHandleStyle(anchor: FlowHandleAnchor): CSSProperties {
  return {
    top: anchor === "middle" ? "50%" : FLOW_HANDLE_TOP,
    background: FLOW_HANDLE_COLOR,
  };
}
