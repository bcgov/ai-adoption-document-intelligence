import { FC } from "react";
import { TextInput } from "../../../../ui";
import type { FieldDefinition } from "../types/field";

interface FieldEditorProps {
  field: FieldDefinition;
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}

export const FieldEditor: FC<FieldEditorProps> = ({
  field,
  value,
  onChange,
  readOnly,
}) => {
  // During labeling, always show raw string values regardless of field type
  // Field type validation only applies when submitting training data to Azure
  return (
    <TextInput
      aria-label={`Value of ${field.fieldKey}`}
      value={value || ""}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      placeholder={readOnly ? "Not labelled yet" : "Enter value"}
      size="xs"
      readOnly={readOnly}
    />
  );
};
