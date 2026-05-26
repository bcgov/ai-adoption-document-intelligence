/**
 * Background container rendered behind the body nodes of a map node. Provides
 * the visual "this is the body of the map" signal in non-simplified view.
 *
 * Pure presentational; the canvas computes its size + position from the
 * bounding box of the member nodes' `metadata.position`.
 */

import type { Node, NodeProps } from "@xyflow/react";
import { memo } from "react";

export interface MapBodyContainerData extends Record<string, unknown> {
  groupId: string;
  label: string;
  color?: string;
  width: number;
  height: number;
  onClick: () => void;
}

export type MapBodyContainerFlowNode = Node<
  MapBodyContainerData,
  "map-body-container"
>;

export const MapBodyContainer = memo(function MapBodyContainer({
  data,
  selected,
}: NodeProps<MapBodyContainerFlowNode>) {
  const accent = data.color ?? "#22c55e";
  return (
    <div
      data-testid={`map-body-container-${data.groupId}`}
      data-synthetic-group="true"
      onClick={data.onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.onClick();
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        width: data.width,
        height: data.height,
        border: `1px dashed ${accent}`,
        background: `${accent}11`,
        borderRadius: 12,
        padding: 4,
        position: "relative",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 12,
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          background: "var(--mantine-color-body, #1a1b1e)",
          padding: "0 4px",
          border: `1px solid ${accent}`,
          borderRadius: 4,
          ...(selected ? { boxShadow: `0 0 0 2px ${accent}55` } : {}),
        }}
      >
        {data.label}
      </div>
    </div>
  );
});
