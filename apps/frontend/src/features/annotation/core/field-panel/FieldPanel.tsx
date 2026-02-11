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
  readOnly?: boolean;
}

export const FieldPanel: FC<FieldPanelProps> = ({
  fields,
  values,
  activeFieldKey,
  onSelectField,
  onValueChange,
  readOnly,
}) => {
  if (fields.length === 0) {
    return (
      <Stack gap="xs">
        <Text fw={600}>No fields configured</Text>
        <Text size="sm" c="dimmed">
          Add fields to this project before labeling documents.
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
          readOnly={readOnly}
        />
      ))}
    </Stack>
  );
};
