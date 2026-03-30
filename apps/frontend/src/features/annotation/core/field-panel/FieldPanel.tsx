import { Stack, Text } from "@mantine/core";
import { FC } from "react";
import type { FieldDefinition } from "../types/field";
import { FieldItem } from "./FieldItem";

export interface FieldPanelValue {
  value?: string;
  confidence?: number;
  isManual?: boolean;
}

interface FieldPanelProps {
  fields: FieldDefinition[];
  values: Record<string, FieldPanelValue | undefined>;
  activeFieldKey?: string | null;
  onSelectField?: (fieldKey: string) => void;
  onValueChange?: (fieldKey: string, value: string) => void;
  onClearField?: (fieldKey: string) => void;
  readOnly?: boolean;
  emptyMessage?: string;
}

export const FieldPanel: FC<FieldPanelProps> = ({
  fields,
  values,
  activeFieldKey,
  onSelectField,
  onValueChange,
  onClearField,
  readOnly,
  emptyMessage,
}) => {
  if (fields.length === 0) {
    return (
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          {emptyMessage ?? "No fields to display."}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {fields.map((field) => (
        <FieldItem
          key={field.id}
          field={field}
          value={values[field.fieldKey]?.value}
          confidence={values[field.fieldKey]?.confidence}
          isActive={activeFieldKey === field.fieldKey}
          onSelect={() => onSelectField?.(field.fieldKey)}
          onValueChange={(value) => onValueChange?.(field.fieldKey, value)}
          onClear={
            onClearField
              ? () => onClearField(field.fieldKey)
              : undefined
          }
          readOnly={readOnly}
        />
      ))}
    </Stack>
  );
};
