/**
 * Custom xyflow edge component for the workflow builder canvas.
 *
 * Renders the underlying `GraphEdge` with stroke colour + an optional
 * inline pill label whose contents reflect the semantic role of the
 * edge:
 *
 *   - `type: "normal"`     → grey stroke, no label.
 *   - `type: "conditional"`→ switch accent stroke, label is either
 *                            `case[i]: <predicate>` (when the edge id is
 *                            referenced by `switch.cases[i].edgeId`),
 *                            `default` (when the edge id is the
 *                            switch's `defaultEdge`), or `case[?]`
 *                            otherwise.
 *   - `type: "error"`      → red stroke, label `on error`.
 *
 * The component reads the `GraphEdge` (and, when applicable, the source
 * `SwitchNode`) from `data` populated by the canvas projection — the
 * canvas walks the graph once and hands each edge enough context to
 * compute its own label without re-walking.
 *
 * See feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/
 * user_stories/US-023-workflow-edge-component.md.
 */

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getStraightPath,
} from "@xyflow/react";
import { type CSSProperties, memo } from "react";
import type { GraphEdge, SwitchNode } from "../../../types/workflow";
import { getControlFlowVisualHints } from "../control-flow-visual-hints";
import { formatCaseLabel } from "./edge-labels";

/**
 * Shape of the `data` payload the canvas projection hands to
 * `WorkflowEdge`. The renderer needs the source `SwitchNode` (only when
 * the source is a switch) so it can resolve `cases[i].edgeId` →
 * `case[i]: <label>` without holding a reference to the entire graph.
 *
 * Phase 4 (US-139) adds the optional `isActive` flag — when true the
 * edge renders with the active-edge animation (blue stroke + 2.5px
 * width); xyflow's built-in marching-ants dash animation is engaged via
 * the edge's `animated` flag set by `WorkflowEditorCanvas`.
 */
export interface WorkflowEdgeData {
  graphEdge: GraphEdge;
  sourceSwitch?: SwitchNode;
  isActive?: boolean;
  [key: string]: unknown;
}

const NORMAL_STROKE = "#9ca3af";
const ERROR_STROKE = "var(--mantine-color-red-6, #e03131)";
const SWITCH_ACCENT = getControlFlowVisualHints("switch").color;
/**
 * Stroke applied to "currently flowing" edges per US-139 / §3.4. Matches
 * `theme.colors.blue[6]` (same blue the "running" node-status badge
 * uses — visual consistency).
 */
const ACTIVE_STROKE = "var(--mantine-color-blue-6, #228be6)";
const ACTIVE_STROKE_WIDTH = 2.5;

interface LabelComputation {
  text: string;
  accent: string;
}

function computeConditionalLabel(
  graphEdge: GraphEdge,
  sourceSwitch: SwitchNode | undefined,
): LabelComputation {
  const accent = SWITCH_ACCENT;
  if (!sourceSwitch) {
    return { text: "case[?]", accent };
  }
  if (sourceSwitch.defaultEdge === graphEdge.id) {
    return { text: formatCaseLabel({ kind: "default" }), accent };
  }
  const caseIndex = sourceSwitch.cases.findIndex(
    (c) => c.edgeId === graphEdge.id,
  );
  if (caseIndex < 0) {
    return { text: "case[?]", accent };
  }
  const expression = sourceSwitch.cases[caseIndex].condition;
  return {
    text: formatCaseLabel({ caseIndex, expression }),
    accent,
  };
}

interface StyleResolution {
  stroke: string;
  label: LabelComputation | null;
}

function resolveStyle(data: WorkflowEdgeData | undefined): StyleResolution {
  if (!data) {
    return { stroke: NORMAL_STROKE, label: null };
  }
  const { graphEdge, sourceSwitch } = data;
  switch (graphEdge.type) {
    case "normal":
      return { stroke: NORMAL_STROKE, label: null };
    case "conditional": {
      const label = computeConditionalLabel(graphEdge, sourceSwitch);
      return { stroke: label.accent, label };
    }
    case "error":
      return {
        stroke: ERROR_STROKE,
        label: { text: "on error", accent: ERROR_STROKE },
      };
  }
}

export const WorkflowEdge = memo(function WorkflowEdge(
  props: EdgeProps & { data?: WorkflowEdgeData },
) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, data } = props;

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const { stroke, label } = resolveStyle(data);
  // Active-edge override (US-139): when the canvas projection flags this
  // edge as the currently-flowing hop, swap in the blue stroke +
  // wider 2.5px line. Otherwise render the existing Phase 1B
  // per-edge-type stroke unchanged.
  const isActive = data?.isActive === true;
  const edgeStyle: CSSProperties = isActive
    ? { stroke: ACTIVE_STROKE, strokeWidth: ACTIVE_STROKE_WIDTH }
    : { stroke, strokeWidth: 2 };

  const labelPillStyle: CSSProperties = {
    position: "absolute",
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
    background: "var(--mantine-color-body, #1a1b1e)",
    color: "var(--mantine-color-text, #f3f4f6)",
    border: `1px solid ${label?.accent ?? stroke}`,
    borderRadius: 10,
    padding: "1px 6px",
    fontSize: 10,
    lineHeight: 1.3,
    fontWeight: 500,
    whiteSpace: "nowrap",
    pointerEvents: "all",
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div data-testid="edge-label" style={labelPillStyle}>
            {label.text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
