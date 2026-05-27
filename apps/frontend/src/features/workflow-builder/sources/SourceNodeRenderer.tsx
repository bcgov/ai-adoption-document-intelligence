/**
 * xyflow custom-node renderer for `SourceNode` (US-117).
 *
 * Source nodes are the workflow's edge to the outside world — they have
 * NO input handle (no upstream connection ever) and a SINGLE typed
 * output handle whose colour comes from the source catalog entry's
 * `outputKind`.
 *
 * Visual shell mirrors the activity rectangle (same Mantine border /
 * selection styling) so the canvas reads consistently. The differences:
 *
 *   - No `Handle type="target"` on the left.
 *   - Catalog lookup uses `getSourceCatalogEntry` instead of
 *     `getActivityCatalogEntry`.
 *
 * Icon / colour hints are resolved via `source-catalog-utils.ts`
 * (US-118) so the palette + settings surfaces share the same mapping.
 *
 * See docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md §7.2.
 */

import {
  getSourceCatalogEntry,
  type KindRef,
  type SourceNode,
} from "@ai-di/graph-workflow";
import { Text, Tooltip } from "@mantine/core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

import { colorForKind } from "../canvas/artifact-kind-colour";
import { NodeTypePill, type NodeTypePillEntry } from "../canvas/NodeTypePill";
import { NodePreviewOverlay } from "../preview/PreviewWidget";
import { NodeStatusBadgeOverlay } from "../run/NodeStatusBadge";
import {
  getSourceVisualHints,
  resolveSourceColor,
} from "./source-catalog-utils";

/**
 * Translate a Mantine colour name into the matching theme CSS variable
 * for the handle dot background. Falls back to the literal value (so
 * `"gray"` still resolves) when the variable is undefined.
 */
function handleBackground(color: string): string {
  return `var(--mantine-color-${color}-6, ${color})`;
}

/**
 * Header accent colour — resolved via `resolveSourceColor` so the
 * palette, canvas, and settings surfaces share the same mapping
 * (US-118). Falls back to the neutral gray token when the catalog
 * entry doesn't declare a `colorHint`.
 */
const FALLBACK_HEADER_COLOR = "#6b7280";

function resolveHeaderColor(colorHint: string | undefined): string {
  return resolveSourceColor(colorHint) ?? FALLBACK_HEADER_COLOR;
}

/**
 * xyflow node data for a `source` node — the projection layer passes
 * the full `SourceNode` shape through under `data`. The renderer reads
 * `sourceType` + `label` and resolves the rest through the catalog.
 *
 * `Record<string, unknown>` widening keeps the shape compatible with
 * xyflow's `Node<Data>` constraint without an unsafe cast.
 */
export type SourceNodeData = SourceNode & Record<string, unknown>;

type SourceFlowNode = Node<SourceNodeData, "source">;
type SourceFlowNodeProps = NodeProps<SourceFlowNode>;

/**
 * Source node renderer. Receives the full `SourceNode` under `data`
 * and looks the entry up in `SOURCE_CATALOG` to source displayName /
 * description / icon / colour / outputKind.
 *
 * If the lookup misses (unregistered subtype), the node still renders
 * with the user's `label` and a gray header — the validator surfaces
 * the unknown-subtype error separately.
 */
export const SourceNodeRenderer = memo(function SourceNodeRenderer({
  id,
  data,
  selected,
}: SourceFlowNodeProps) {
  const entry = getSourceCatalogEntry(data.sourceType);
  const hints = getSourceVisualHints(data.sourceType);
  const displayName = hints.displayName;
  const accent = resolveHeaderColor(entry?.colorHint);
  const Icon = hints.Icon;
  const outputKind: KindRef = entry?.outputKind ?? "Artifact";
  const handleColor = colorForKind(outputKind);

  // Phase 3 type pill — source nodes have a SINGLE typed output so the
  // pill always renders the one-line shape. For source.api a small
  // dimmed footnote sits under the pill (Scenario 3: "see Settings →
  // Fields for typed field-level kinds").
  const outputPillEntries: NodeTypePillEntry[] = entry
    ? [{ portName: "out", kind: entry.outputKind }]
    : [];
  const showFieldsFootnote = data.sourceType === "source.api";

  // User-authored label override: if `node.label` differs from the
  // catalog's `displayName`, render it as a subtitle below the
  // displayName.
  const labelOverride =
    data.label && data.label !== displayName ? data.label : null;

  return (
    <div
      data-testid={`canvas-node-${id}`}
      data-shape="rectangle"
      data-node-type="source"
      data-source-type={data.sourceType}
      style={{
        background: "var(--mantine-color-body, #fff)",
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 6,
        borderStyle: "solid",
        borderTopColor: selected ? accent : "transparent",
        borderRightColor: selected ? accent : "transparent",
        borderBottomColor: selected ? accent : "transparent",
        borderLeftColor: accent,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 200,
        boxShadow: selected
          ? `0 0 0 2px ${accent}33, 0 6px 18px rgba(0,0,0,0.22)`
          : "0 2px 8px rgba(0,0,0,0.18)",
        color: "var(--mantine-color-text, #f3f4f6)",
        fontSize: 13,
        lineHeight: 1.2,
        position: "relative",
      }}
    >
      <NodeStatusBadgeOverlay nodeId={id} />
      <div
        data-testid={`source-node-header-${id}`}
        style={{
          fontSize: 11,
          color: "var(--mantine-color-dimmed, #9ca3af)",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{ color: accent, display: "inline-flex" }}
          data-testid={`source-node-icon-${id}`}
        >
          <Icon size={14} />
        </span>
        <Text
          component="span"
          size="xs"
          c={entry?.colorHint ?? undefined}
          style={{ textTransform: "uppercase", letterSpacing: 0.4 }}
          data-testid={`source-node-display-name-${id}`}
        >
          {displayName}
        </Text>
      </div>
      {labelOverride !== null && (
        <div
          style={{ fontWeight: 600 }}
          data-testid={`source-node-label-${id}`}
        >
          {labelOverride}
        </div>
      )}
      <NodePreviewOverlay nodeId={id} />
      {/*
        Output handle — coloured by the catalog entry's `outputKind`.
        Hover tooltip reads the kind literal verbatim ("Document" /
        "Artifact"). NO target handle on the left — that's the whole
        point of US-117 Scenario 1.
      */}
      <Tooltip label={outputKind} withArrow position="right">
        <span
          data-testid={`source-output-handle-wrapper-${id}`}
          data-port-direction="output"
          data-port-color={handleColor}
          data-port-tooltip={outputKind}
        >
          <Handle
            id="out"
            type="source"
            position={Position.Right}
            style={{ background: handleBackground(handleColor) }}
          />
        </span>
      </Tooltip>
      {/*
        On-selection type pill — only the output side. Mirrors the
        anchoring used by activity nodes' output pill (see
        `WorkflowEditorCanvas.tsx` `NodeHandles`): pinned to the right
        edge with a 14px gutter so it sits outside the node body. The
        footnote (source.api only) renders under the pill within the
        same wrapper.
      */}
      <div
        data-pill-anchor="output"
        style={{
          position: "absolute",
          right: -14,
          top: "50%",
          transform: "translate(100%, -50%)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <NodeTypePill
          entries={outputPillEntries}
          direction="output"
          hidden={!selected}
        />
        {selected && showFieldsFootnote && (
          <Text
            size="xs"
            c="dimmed"
            data-testid={`source-node-fields-footnote-${id}`}
            style={{ marginTop: 2, maxWidth: 160 }}
          >
            see Settings → Fields for typed field-level kinds
          </Text>
        )}
      </div>
    </div>
  );
});
SourceNodeRenderer.displayName = "SourceNodeRenderer";
