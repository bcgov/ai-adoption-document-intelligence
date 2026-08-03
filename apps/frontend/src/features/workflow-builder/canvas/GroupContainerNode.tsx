/**
 * The container box drawn behind the members of a group — ONE visual language
 * for every kind of group on the canvas (G-1, 2026-08-03).
 *
 * Until this replaced it, a group could look three different ways: a map
 * node's body got this box (green, dashed), an authored group got a per-node
 * dashed violet outline plus a label that only appeared on hover, and the same
 * authored group collapsed got a chip. Three renderings of one idea, and the
 * only one that read as "these belong together" was the box. So the box now
 * serves both, and the outline treatment is gone.
 *
 * Membership is EXPLICIT, never spatial. The box is a projection of
 * `nodeGroups[<id>].nodeIds` — it re-renders around wherever the declared
 * members happen to sit. Dragging an unrelated node into its area joins
 * nothing, and dragging a member out does not eject it. This is the deliberate
 * departure from ComfyUI: membership is a config fact the engine reads, not an
 * artifact of two rectangles overlapping.
 *
 * The header strip is the only interactive part: it carries the group's icon,
 * colour and label, it opens the group's settings on click, and (for authored
 * groups) it is the drag handle that moves every member at once — see
 * `group-drag-cohesion.ts`. The box body stays `pointerEvents: none` so clicks
 * and pans fall through to the members and the pane behind it.
 */

import type { Node, NodeProps } from "@xyflow/react";
import { memo } from "react";
import { GROUP_ICONS } from "../group/group-icons";
import { isSyntheticMapBodyGroupId } from "./map-body-groups";

/**
 * xyflow class on the header strip. Doubles as the `dragHandle` selector for
 * authored group containers, which is what makes "drag the header" a different
 * gesture from "drag a member" (R-1) rather than a heuristic over the box.
 */
export const GROUP_HEADER_CLASS = "wb-group-header";

/** Deterministic xyflow id for a group's container box. */
export function containerIdForGroup(groupId: string): string {
  return `container-${groupId}`;
}

/**
 * Inverse of `containerIdForGroup` — `null` for any other node id. The drag
 * handlers use this to tell a header drag (the box's own node) from a member
 * drag without consulting the projection.
 */
export function groupIdFromContainerId(nodeId: string): string | null {
  const prefix = "container-";
  if (!nodeId.startsWith(prefix)) return null;
  const rest = nodeId.slice(prefix.length);
  return rest.length > 0 ? rest : null;
}

export interface GroupContainerNodeData extends Record<string, unknown> {
  /** `config.nodeGroups` key — authored or synthetic map-body. */
  groupId: string;
  label: string;
  color?: string;
  /** `GROUP_ICONS` key. Authored groups only — map bodies have no icon. */
  icon?: string;
  width: number;
  height: number;
  /**
   * Header click. For an authored group this opens the group's settings; for
   * a map body it selects the owning map node, where the body entry/exit that
   * define the box live.
   */
  onOpen: () => void;
}

export type GroupContainerFlowNode = Node<
  GroupContainerNodeData,
  "group-container"
>;

/** Default accents: violet for authored groups, green for map bodies. */
const AUTHORED_ACCENT = "#7950f2";
const MAP_BODY_ACCENT = "#22c55e";

export const GroupContainerNode = memo(function GroupContainerNode({
  data,
  selected,
}: NodeProps<GroupContainerFlowNode>) {
  const synthetic = isSyntheticMapBodyGroupId(data.groupId);
  const accent = data.color ?? (synthetic ? MAP_BODY_ACCENT : AUTHORED_ACCENT);
  const IconComponent = data.icon ? GROUP_ICONS[data.icon] : undefined;
  return (
    <div
      data-testid={`group-container-${data.groupId}`}
      data-group-container="true"
      data-synthetic-group={synthetic ? "true" : "false"}
      style={{
        width: data.width,
        height: data.height,
        border: `1px dashed ${accent}`,
        background: `${accent}11`,
        borderRadius: 12,
        position: "relative",
        // The box itself is a passive backdrop: let clicks/drags fall through
        // to the member nodes and the canvas pane behind it. Only the header
        // strip is interactive (below). Without this the box would swallow
        // pans started inside it — and, worse, make the area look like a drop
        // target for joining the group, which it deliberately is not.
        pointerEvents: "none",
      }}
    >
      <button
        type="button"
        className={GROUP_HEADER_CLASS}
        data-testid={`group-container-header-${data.groupId}`}
        onClick={data.onOpen}
        title={
          synthetic
            ? "Open the map node's settings"
            : "Drag to move the whole group · click to open its settings"
        }
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxSizing: "border-box",
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          textAlign: "left",
          background: "var(--mantine-color-body, #1a1b1e)",
          border: "none",
          borderBottom: `1px dashed ${accent}`,
          borderRadius: "11px 11px 0 0",
          // A map body is derived from its map node's entry/exit, so it has no
          // cohesive drag — only authored groups advertise the grab cursor.
          cursor: synthetic ? "pointer" : "grab",
          // Re-enable interaction on just the header so it stays clickable and
          // draggable inside a pointer-events:none box.
          pointerEvents: "auto",
          ...(selected ? { boxShadow: `0 0 0 2px ${accent}55` } : {}),
        }}
      >
        {IconComponent && (
          <span
            data-testid={`group-container-icon-${data.groupId}`}
            style={{ display: "inline-flex", color: accent }}
          >
            <IconComponent size={14} />
          </span>
        )}
        <span>{data.label}</span>
      </button>
    </div>
  );
});
