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
 *
 * Connect-time drop-target highlight (PORT_WIRING_DESIGN.md §6.2): while a
 * port-to-port drag is in progress, the canvas publishes the drag's source
 * kind via `PortDragContext`. Each input row self-classifies as a
 * compatible (enlarged handle) or incompatible (dimmed row) drop target —
 * see `PortRow`'s `dropCompatible` derivation below.
 */

import { isAssignable, type KindRef } from "@ai-di/graph-workflow";
import { Tooltip } from "@mantine/core";
import { Handle, Position } from "@xyflow/react";
import {
  type CSSProperties,
  createContext,
  memo,
  type MouseEvent as ReactMouseEvent,
  useContext,
} from "react";

import { colorForKind } from "./artifact-kind-colour";
import { handleArrayOutline, handleBackground } from "./handle-style";
import {
  PORT_ROW_HEIGHT,
  PORT_ROWS_TOP_MARGIN,
  type PortRowModel,
} from "./port-rows";

/**
 * Published by the canvas while a per-port connection drag is in progress
 * (§6.2): carries the drag source's output kind so every input row can
 * self-classify as a compatible (highlight) or incompatible (dim) drop
 * target. `null` when no port drag is active.
 */
export const PortDragContext = createContext<{
  sourceKind: KindRef | undefined;
} | null>(null);

export interface PortRowsProps {
  nodeId: string;
  inputs: PortRowModel[];
  outputs: PortRowModel[];
  /**
   * §9 — hover-to-extend from a typed OUTPUT port. Fired on an output row
   * handle's mouseenter with the handle's right-centre anchor (same geometry
   * the node-level `out` handle uses). The canvas debounces these into the
   * kind-aware extend popover. Input rows never fire these.
   */
  onOutputHandleEnter?: (
    nodeId: string,
    portName: string,
    anchor: { x: number; y: number },
  ) => void;
  onOutputHandleLeave?: () => void;
  /**
   * Inderdeep walkthrough 2026-07-29 — hover-to-extend UPSTREAM from a
   * typed INPUT port ("what produces the value this port needs?"). Fired
   * on an input row handle's mouseenter with the handle's left-centre
   * anchor; the canvas debounces these into the producer-filtered extend
   * popover. Mirror of the output-side pair above.
   */
  onInputHandleEnter?: (
    nodeId: string,
    portName: string,
    anchor: { x: number; y: number },
  ) => void;
  onInputHandleLeave?: () => void;
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
 * Enlarged dot size for a compatible drop target during a port drag
 * (§6.2), up from the base 12×12px stamped by `workflow-editor-canvas.css`.
 */
const DROP_COMPATIBLE_HANDLE_SIZE = 16;

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
  onOutputHandleEnter,
  onOutputHandleLeave,
  onInputHandleEnter,
  onInputHandleLeave,
}: {
  nodeId: string;
  row: PortRowModel;
  gridRow: number;
  onOutputHandleEnter?: (
    nodeId: string,
    portName: string,
    anchor: { x: number; y: number },
  ) => void;
  onOutputHandleLeave?: () => void;
  onInputHandleEnter?: (
    nodeId: string,
    portName: string,
    anchor: { x: number; y: number },
  ) => void;
  onInputHandleLeave?: () => void;
}) {
  const isInput = row.direction === "input";
  const color = colorForKind(row.kind);
  const isArray = row.kind?.endsWith("[]") === true;

  const drag = useContext(PortDragContext);
  // Input rows classify against the in-flight drag; wildcard (base
  // Artifact) ports accept any drop (§6.2). Output rows are untouched —
  // only input handles are ever drop targets.
  const dropCompatible =
    drag !== null && isInput
      ? row.kind === undefined ||
        row.kind === "Artifact" ||
        isAssignable(drag.sourceKind, row.kind)
      : null;

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
    // Enlarge the dot for a compatible drop target during a drag. Grown via
    // explicit width/height (not `transform: scale()`): xyflow's base
    // `.react-flow__handle-left`/`-right` CSS classes already apply a
    // `translate(-50%, -50%)` positioning transform, and that percentage is
    // resolved against the handle's OWN box size at layout time — so
    // enlarging width/height keeps the dot centred on the same anchor point
    // for free, whereas an inline `transform` would outright replace (not
    // compose with) the class's translate and knock the dot off-position.
    ...(dropCompatible === true
      ? {
          width: DROP_COMPATIBLE_HANDLE_SIZE,
          height: DROP_COMPATIBLE_HANDLE_SIZE,
        }
      : {}),
  };

  return (
    <div
      data-testid={`port-row-${nodeId}-${row.handleId}`}
      data-port-kind={row.kind ?? "Artifact"}
      data-needs-source={row.needsSource ? "true" : "false"}
      data-from-ctx={row.fromCtx}
      {...(dropCompatible === null
        ? {}
        : { "data-drop-compatible": String(dropCompatible) })}
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
        ...(dropCompatible === false ? { opacity: 0.35 } : {}),
      }}
    >
      {/*
       * The handle sits OUTSIDE the tooltip target on purpose. Hovering an
       * output handle already opens the kind-aware hover-extend popover (§9);
       * if the handle were inside the tooltip, that same hover would ALSO open
       * the port tooltip and the two would render on top of each other (the
       * exact overlap varies with canvas zoom, since both are portalled at
       * fixed screen px while their anchors scale). Scoping the tooltip to the
       * label below means the handle's hover shows only the picker, and the
       * port description shows only when hovering the label — they never
       * coexist, at any zoom.
       */}
      <Handle
        id={row.handleId}
        type={isInput ? "target" : "source"}
        position={isInput ? Position.Left : Position.Right}
        isConnectable
        style={handleStyle}
        {...(isInput
          ? {
              // Inderdeep walkthrough 2026-07-29 — the upstream mirror of
              // the output hover below: left-centre anchor, producer-
              // filtered popover.
              onMouseEnter: (event: ReactMouseEvent<HTMLDivElement>) => {
                if (!onInputHandleEnter) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onInputHandleEnter(nodeId, row.name, {
                  x: rect.left,
                  y: rect.top + rect.height / 2,
                });
              },
              onMouseLeave: () => onInputHandleLeave?.(),
            }
          : {
              onMouseEnter: (event: ReactMouseEvent<HTMLDivElement>) => {
                if (!onOutputHandleEnter) return;
                // Right-centre of the handle dot — same anchor geometry as
                // the node-level `out` handle (§9 / makeSourceHandleHoverHandlers).
                const rect = event.currentTarget.getBoundingClientRect();
                onOutputHandleEnter(nodeId, row.name, {
                  x: rect.right,
                  y: rect.top + rect.height / 2,
                });
              },
              onMouseLeave: () => onOutputHandleLeave?.(),
            })}
      />
      <Tooltip
        label={rowTooltip(row)}
        withArrow
        position={isInput ? "left" : "right"}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
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
                // the row into the opposite column.
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              · from {row.fromCtx}
            </span>
          )}
        </span>
      </Tooltip>
    </div>
  );
}

export const PortRows = memo(function PortRows({
  nodeId,
  inputs,
  outputs,
  onOutputHandleEnter,
  onOutputHandleLeave,
  onInputHandleEnter,
  onInputHandleLeave,
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
          onInputHandleEnter={onInputHandleEnter}
          onInputHandleLeave={onInputHandleLeave}
        />
      ))}
      {outputs.map((row, index) => (
        <PortRow
          key={row.handleId}
          nodeId={nodeId}
          row={row}
          gridRow={index + 1}
          onOutputHandleEnter={onOutputHandleEnter}
          onOutputHandleLeave={onOutputHandleLeave}
        />
      ))}
    </div>
  );
});
