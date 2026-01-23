import { FC } from "react";
import { Layer, Line, Group, Text as KonvaText } from "react-konva";
import { BoundingBox } from "../types";

interface BoundingBoxProps {
  id: string;
  box: BoundingBox;
  label?: string;
  color: string;
  isSelected: boolean;
  isHovered: boolean;
  confidence?: number;
  onClick?: (id: string) => void;
  onMouseEnter?: (id: string) => void;
  onMouseLeave?: (id: string) => void;
}

const BoundingBoxShape: FC<BoundingBoxProps> = ({
  id,
  box,
  label,
  color,
  isSelected,
  isHovered,
  confidence,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const points: number[] = [];
  for (const point of box.polygon) {
    points.push(point.x, point.y);
  }
  points.push(box.polygon[0].x, box.polygon[0].y);

  const strokeWidth = isSelected ? 2.5 : isHovered ? 2 : 1.2;
  const opacity = isSelected ? 0.9 : isHovered ? 0.8 : 0.6;
  const hasLabel = Boolean(label);
  const fillOpacity = hasLabel ? (isSelected ? 0.08 : 0.04) : 0;
  const fillColor = hasLabel ? color : "transparent";

  const firstPoint = box.polygon[0];

  return (
    <Group>
      <Line
        points={points}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
        closed={true}
        fill={fillColor}
        fillOpacity={fillOpacity}
        perfectDrawEnabled={false}
        hitStrokeWidth={0}
        onClick={() => onClick?.(id)}
        onMouseEnter={() => onMouseEnter?.(id)}
        onMouseLeave={() => onMouseLeave?.(id)}
        listening={true}
      />
      {(label || confidence !== undefined) && (
        <Group x={firstPoint.x} y={firstPoint.y - 20}>
          <KonvaText
            text={label ? `${label}${confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : ''}` : `${Math.round((confidence || 0) * 100)}%`}
            fontSize={12}
            fill={color}
            fontStyle="bold"
          />
        </Group>
      )}
    </Group>
  );
};

interface BoundingBoxLayerProps {
  boxes: Array<{
    id: string;
    box: BoundingBox;
    label?: string;
    color?: string;
    confidence?: number;
  }>;
  selectedBoxId: string | null;
  hoveredBoxId: string | null;
  onBoxClick?: (id: string) => void;
  onBoxMouseEnter?: (id: string) => void;
  onBoxMouseLeave?: (id: string) => void;
}

export const BoundingBoxLayer: FC<BoundingBoxLayerProps> = ({
  boxes,
  selectedBoxId,
  hoveredBoxId,
  onBoxClick,
  onBoxMouseEnter,
  onBoxMouseLeave,
}) => {
  return (
    <Layer>
      {boxes.map((item) => (
        <BoundingBoxShape
          key={item.id}
          id={item.id}
          box={item.box}
          label={item.label}
          color={item.color || "#228be6"}
          isSelected={item.id === selectedBoxId}
          isHovered={item.id === hoveredBoxId}
          confidence={item.confidence}
          onClick={onBoxClick}
          onMouseEnter={onBoxMouseEnter}
          onMouseLeave={onBoxMouseLeave}
        />
      ))}
    </Layer>
  );
};
