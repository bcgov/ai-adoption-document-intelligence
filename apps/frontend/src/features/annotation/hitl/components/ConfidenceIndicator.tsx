import { Badge } from "@mantine/core";
import { FC } from "react";

interface ConfidenceIndicatorProps {
  confidence?: number;
}

const getConfidenceColor = (confidence?: number) => {
  if (confidence === undefined) return "gray";
  if (confidence >= 0.9) return "green";
  if (confidence >= 0.7) return "yellow";
  return "red";
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
