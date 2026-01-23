import { FC } from "react";
import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import type { FieldDefinition } from "../types/field";
import { FieldEditor } from "./FieldEditor";

interface FieldItemProps {
  field: FieldDefinition;
  value?: string;
  confidence?: number;
  isActive?: boolean;
  onSelect?: () => void;
  onValueChange?: (value: string) => void;
}

const getConfidenceColor = (confidence?: number) => {
  if (confidence === undefined) return "gray";
  if (confidence >= 0.9) return "green";
  if (confidence >= 0.7) return "yellow";
  return "red";
};

export const FieldItem: FC<FieldItemProps> = ({
  field,
  value,
  confidence,
  isActive,
  onSelect,
  onValueChange,
}) => {
  return (
    <Card
      withBorder
      padding="sm"
      style={{
        cursor: "pointer",
        borderColor: isActive ? "#228be6" : undefined,
      }}
      onClick={onSelect}
    >
      <Stack gap="xs">
        <Group justify="space-between" gap="xs">
          <Text fw={600} size="sm">
            {field.fieldKey}
          </Text>
          {confidence !== undefined && (
            <Badge size="xs" color={getConfidenceColor(confidence)} variant="light">
              {Math.round(confidence * 100)}%
            </Badge>
          )}
        </Group>

        <FieldEditor field={field} value={value} onChange={onValueChange} />
      </Stack>
    </Card>
  );
};
