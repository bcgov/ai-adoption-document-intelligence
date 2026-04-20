import { ActionIcon, Badge, Card, Group, Stack, Text } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { FC } from "react";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
import type { FieldDefinition } from "../types/field";
import { FieldEditor } from "./FieldEditor";

interface FieldItemProps {
  field: FieldDefinition;
  value?: string;
  confidence?: number;
  isActive?: boolean;
  onSelect?: () => void;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  readOnly?: boolean;
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
  onClear,
  readOnly,
}) => {
  // Generate deterministic color based on field key
  const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);

  return (
    <Card
      withBorder
      padding="sm"
      style={{
        cursor: "pointer",
        borderColor: isActive ? "#ff0000" : borderCss,
        borderStyle: isActive ? "dashed" : "solid",
        borderWidth: isActive ? "3px" : "2px",
      }}
      onClick={onSelect}
    >
      <Stack gap="xs">
        <Group justify="space-between" gap="xs">
          <Text fw={600} size="sm" style={{ flex: 1, minWidth: 0 }}>
            {field.fieldKey}
          </Text>
          <Group gap={4} wrap="nowrap">
            {confidence !== undefined && (
              <Badge
                size="xs"
                color={getConfidenceColor(confidence)}
                variant="light"
              >
                {Math.round(confidence * 100)}%
              </Badge>
            )}
            {value && onClear && (
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                title="Clear field value"
              >
                <IconX size={12} />
              </ActionIcon>
            )}
          </Group>
        </Group>

        <FieldEditor
          field={field}
          value={value}
          onChange={onValueChange}
          readOnly={readOnly}
        />
      </Stack>
    </Card>
  );
};
