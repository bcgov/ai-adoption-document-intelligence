import { FC } from "react";
import { Layer, Rect } from "react-konva";
import { Point } from "../types";

interface DrawingLayerProps {
  drawingBox: {
    start: Point;
    end: Point;
  } | null;
  color?: string;
}

export const DrawingLayer: FC<DrawingLayerProps> = ({
  drawingBox,
  color = "#40c057",
}) => {
  if (!drawingBox) return null;

  const { start, end } = drawingBox;
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return (
    <Layer>
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        stroke={color}
        strokeWidth={2}
        dash={[5, 5]}
        listening={false}
      />
    </Layer>
  );
};
