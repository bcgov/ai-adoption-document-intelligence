/**
 * xyflow custom-node renderer for a "group chip" — the collapsed visual
 * for a `nodeGroups[<id>]` entry when simplified view is ON (US-043).
 *
 * Reuses the visual style of `GraphVisualization.tsx`'s `GroupNodeRenderer`
 * (label + icon + node-count badge) adapted for the interactive editor:
 *   - Activity-rectangle handle layout (target on the left, source on the
 *     right) so xyflow can wire chip → external edges identically to the
 *     other node renderers.
 *   - Selected-state ring matching `ActivityNodeRenderer`'s box-shadow
 *     so the chip lights up consistently when the user clicks it.
 *   - Selection routes through xyflow's standard `onSelectionChange` —
 *     the parent canvas translates the chip's xyflow id into a group id
 *     before firing `onGroupChipClick`.
 */

import { Badge } from "@mantine/core";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { GROUP_ICONS } from "../group/group-icons";
import { GroupAggregateStatusBadgeOverlay } from "../run/NodeStatusBadge";

export interface GroupChipNodeData extends Record<string, unknown> {
  /** Underlying `nodeGroups[<id>]` key — needed so the canvas can map a
   *  chip selection back to the group it represents. */
  groupId: string;
  label: string;
  icon?: string;
  color?: string;
  nodeCount: number;
  /**
   * Original ids of the nodes folded into the chip. Powers the chip's
   * aggregate `NodeStatusBadge` (US-138 Scenario 5).
   */
  memberNodeIds: readonly string[];
}

export type GroupChipFlowNode = Node<GroupChipNodeData, "group-chip">;

const DEFAULT_CHIP_COLOR = "#5b8def";

export const GroupChipNode = memo(function GroupChipNode({
  id,
  data,
  selected,
}: NodeProps<GroupChipFlowNode>) {
  const color = data.color ?? DEFAULT_CHIP_COLOR;
  const IconComponent = data.icon ? GROUP_ICONS[data.icon] : undefined;

  return (
    <div
      data-testid={`canvas-group-chip-${data.groupId}`}
      data-node-type="group-chip"
      style={{
        borderRadius: 12,
        border: `2px solid ${color}`,
        background: "var(--mantine-color-body, #fff)",
        padding: "10px 14px",
        minWidth: 220,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        boxShadow: selected
          ? `0 0 0 2px ${color}33, 0 6px 18px rgba(0,0,0,0.22)`
          : "0 2px 8px rgba(0,0,0,0.18)",
        color: "var(--mantine-color-text, #111827)",
        fontSize: 13,
        lineHeight: 1.2,
        position: "relative",
      }}
    >
      <GroupAggregateStatusBadgeOverlay memberIds={data.memberNodeIds} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {IconComponent && (
            <span
              data-testid="group-chip-icon"
              style={{ color, display: "inline-flex" }}
            >
              <IconComponent size={20} />
            </span>
          )}
          <span style={{ fontWeight: 600, fontSize: 14 }}>{data.label}</span>
        </div>
        <Badge
          data-testid="group-chip-node-count"
          size="sm"
          variant="light"
          color="gray"
        >
          {data.nodeCount} {data.nodeCount === 1 ? "node" : "nodes"}
        </Badge>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: color }}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: color }}
        isConnectable={false}
      />
      {/* Suppress unused-id lint — xyflow always provides it. */}
      <span hidden data-canvas-id={id} />
    </div>
  );
});
