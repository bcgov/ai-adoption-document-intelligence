import { FC } from "react";
import { Badge } from "../../../../ui";

interface ConfidenceIndicatorProps {
  confidence?: number;
}

const getConfidenceColor = (confidence?: number) => {
  if (confidence === undefined) return "gray";
  if (confidence >= 0.9) return "green";
  if (confidence >= 0.7) return "yellow";
  return "red";
};

/**
 * CSS color (Mantine theme variable) matching getConfidenceColor's tier.
 * Useful for things like borders where you want the actual stroke color,
 * not the Badge color name.
 */
export const getConfidenceBorderColor = (confidence?: number): string => {
  if (confidence === undefined) return "var(--mantine-color-gray-6)";
  if (confidence >= 0.9) return "var(--mantine-color-green-6)";
  if (confidence >= 0.7) return "var(--mantine-color-yellow-6)";
  return "var(--mantine-color-red-6)";
};

/**
 * Concrete hex color matching the same tier as the Mantine color names.
 * Konva renders to <canvas> via the 2D API and doesn't resolve CSS variables,
 * so canvas bounding-box strokes/fills need real values.
 */
export const getConfidenceCanvasColor = (confidence?: number): string => {
  if (confidence === undefined) return "#868e96"; // gray-6
  if (confidence >= 0.9) return "#40c057"; // green-6
  if (confidence >= 0.7) return "#fab005"; // yellow-6
  return "#fa5252"; // red-6
};

export const ConfidenceIndicator: FC<ConfidenceIndicatorProps> = ({
  confidence,
}) => {
  if (confidence === undefined) {
    return (
      <Badge size="xs" variant="light" color="gray">
        N/A
      </Badge>
    );
  }

  return (
    <Badge size="xs" variant="light" color={getConfidenceColor(confidence)}>
      {Math.round(confidence * 100)}%
    </Badge>
  );
};
