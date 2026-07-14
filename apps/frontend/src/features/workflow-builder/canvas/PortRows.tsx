/**
 * `PortRows` — per-port row list rendered inside an activity node's card
 * (PORT_WIRING_DESIGN.md, port-row rendering slice).
 *
 * Two-column grid: inputs on the left, outputs on the right, one row per
 * catalog port. Each row mounts its own kind-coloured ReactFlow `<Handle>`
 * (id from `inputHandleId`/`outputHandleId` via `PortRowModel.handleId`)
 * absolutely positioned just outside the card edge at the row's vertical
 * centre, so the upcoming wire→edge projection can attach edges per port.
 *
 * Per-port handles are connectable: a port-to-port drag pins a binding
 * (PORT_WIRING_DESIGN.md §6.1 — see `WorkflowEditorCanvas.handleConnect`),
 * while the node-level handles keep today's node-to-node connect gesture.
 * Row height is locked to `PORT_ROW_HEIGHT` because `estimateNodeHeight`
 * (auto-layout) derives card height from the row count.
 *
 * Vocabulary rule: rows show the plain-language `label`; the raw port
 * `name` + kind literal live in the tooltip.
 */

import { Tooltip } from "@mantine/core";
import { Handle, Position } from "@xyflow/react";
import { type CSSProperties, memo } from "react";

import { colorForKind } from "./artifact-kind-colour";
import { handleArrayOutline, handleBackground } from "./handle-style";
import {
  PORT_ROW_HEIGHT,
  PORT_ROWS_TOP_MARGIN,
  type PortRowModel,
} from "./port-rows";

export interface PortRowsProps {
  nodeId: string;
  inputs: PortRowModel[];
  outputs: PortRowModel[];
}

/**
 * Horizontal offsets that place the handle dot just outside the card
 * border. The activity card renders `padding: 10px 14px` with a 6px left /
 * 2px right border, and each row is `position: relative` — so the dot's
 * containing block starts at the card's content box, not its outer edge.
 */
const INPUT_HANDLE_LEFT = -24; // 14px padding + 6px border + 4px clearance
const OUTPUT_HANDLE_RIGHT = -20; // 14px padding + 2px border + 4px clearance

/**
 * Amber "needs a source" ring (required input with no wire/binding). Array
 * kinds already wear a 2px outline at 2px offset (4px past the dot edge),
 * so their ring widens to 7px to clear the outline — otherwise the two
 * cues stack into one muddled halo.
 */
const NEEDS_SOURCE_RING = "0 0 0 3px var(--mantine-color-yellow-5, #fab005)";
const NEEDS_SOURCE_RING_ARRAY =
  "0 0 0 7px var(--mantine-color-yellow-5, #fab005)";

function rowTooltip(row: PortRowModel): string {
  const kindText = `${row.name}: ${row.kind ?? "Artifact"}`;
  return row.description ? `${kindText} — ${row.description}` : kindText;
}

function PortRow({
  nodeId,
  row,
  gridRow,
}: {
  nodeId: string;
  row: PortRowModel;
  gridRow: number;
}) {
  const isInput = row.direction === "input";
  const color = colorForKind(row.kind);
  const isArray = row.kind?.endsWith("[]") === true;

  const handleStyle: CSSProperties = {
    background: handleBackground(color),
    top: "50%",
    ...(isInput ? { left: INPUT_HANDLE_LEFT } : { right: OUTPUT_HANDLE_RIGHT }),
    // Doubled outline signals `T[]` cardinality — mirrors the node-level
    // handle cue. `outline` (not `border`) so hit-testing is unaffected.
    ...(isArray
      ? {
          outline: `2px solid ${handleArrayOutline(color)}`,
          outlineOffset: "2px",
        }
      : {}),
    ...(row.needsSource
      ? { boxShadow: isArray ? NEEDS_SOURCE_RING_ARRAY : NEEDS_SOURCE_RING }
      : {}),
  };

  return (
    <Tooltip
      label={rowTooltip(row)}
      withArrow
      position={isInput ? "left" : "right"}
    >
      <div
        data-testid={`port-row-${nodeId}-${row.handleId}`}
        data-port-kind={row.kind ?? "Artifact"}
        data-needs-source={row.needsSource ? "true" : "false"}
        data-from-ctx={row.fromCtx}
        style={{
          position: "relative",
          gridColumn: isInput ? 1 : 2,
          gridRow,
          height: PORT_ROW_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: isInput ? "flex-start" : "flex-end",
          gap: 4,
          minWidth: 0,
          fontSize: 11,
          color: "var(--mantine-color-dimmed, #9ca3af)",
        }}
      >
        <Handle
          id={row.handleId}
          type={isInput ? "target" : "source"}
          position={isInput ? Position.Left : Position.Right}
          isConnectable
          style={handleStyle}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.label}
        </span>
        {row.fromCtx !== undefined && (
          <span
            style={{
              fontStyle: "italic",
              whiteSpace: "nowrap",
              // Shrinkable + ellipsized so a long ctx key can't overflow
              // the row into the opposite column (the row div can't clip
              // via `overflow: hidden` — that would cut off the handle
              // dot positioned outside the card edge).
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            · from {row.fromCtx}
          </span>
        )}
      </div>
    </Tooltip>
  );
}

export const PortRows = memo(function PortRows({
  nodeId,
  inputs,
  outputs,
}: PortRowsProps) {
  if (inputs.length === 0 && outputs.length === 0) return null;
  return (
    <div
      data-testid={`port-rows-${nodeId}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 12,
        marginTop: PORT_ROWS_TOP_MARGIN,
      }}
    >
      {inputs.map((row, index) => (
        <PortRow
          key={row.handleId}
          nodeId={nodeId}
          row={row}
          gridRow={index + 1}
        />
      ))}
      {outputs.map((row, index) => (
        <PortRow
          key={row.handleId}
          nodeId={nodeId}
          row={row}
          gridRow={index + 1}
        />
      ))}
    </div>
  );
});
