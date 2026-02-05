import { Checkbox, NumberInput, TextInput } from "@mantine/core";
import { FC } from "react";
import type { FieldDefinition } from "../types/field";
import { FieldType } from "../types/field";
import { TableFieldView } from "./TableFieldView";

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
  if (field.fieldType === FieldType.TABLE) {
    return <TableFieldView value={value} />;
  }

  if (field.fieldType === FieldType.SELECTION_MARK) {
    return (
      <Checkbox
        checked={value === "selected"}
        onChange={(event) =>
          onChange?.(event.currentTarget.checked ? "selected" : "unselected")
        }
        label="Selected"
        readOnly={readOnly}
      />
    );
  }

  if (field.fieldType === FieldType.NUMBER) {
    return (
      <NumberInput
        value={value ? Number(value) : undefined}
        onChange={(val) => onChange?.(val?.toString() || "")}
        placeholder="Enter value"
        size="xs"
        readOnly={readOnly}
      />
    );
  }

  return (
    <TextInput
      value={value || ""}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      placeholder="Enter value"
      size="xs"
      readOnly={readOnly}
    />
  );
};
