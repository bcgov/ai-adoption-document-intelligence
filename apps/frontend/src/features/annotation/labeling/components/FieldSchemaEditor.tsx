import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { FC, useEffect, useMemo, useState } from "react";
import { FieldDefinition, FieldType } from "../../core/types/field";

interface FieldSchemaEditorProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: {
    field_key: string;
    field_type: FieldType;
    field_format?: string;
    display_order?: number;
  }) => void;
  initialValue?: FieldDefinition | null;
}

export const FieldSchemaEditor: FC<FieldSchemaEditorProps> = ({
  opened,
  onClose,
  onSubmit,
  initialValue,
}) => {
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>(FieldType.STRING);
  const [fieldFormat, setFieldFormat] = useState("");

  useEffect(() => {
    if (opened) {
      setFieldKey(initialValue?.fieldKey || "");
      setFieldType(initialValue?.fieldType || FieldType.STRING);
      setFieldFormat(initialValue?.fieldFormat || "");
    }
  }, [initialValue, opened]);

  const fieldTypeOptions = useMemo(
    () =>
      Object.values(FieldType).map((value) => ({
        value,
        label: value,
      })),
    [],
  );

  const handleSubmit = () => {
    onSubmit({
      field_key: fieldKey.trim(),
      field_type: fieldType,
      field_format: fieldFormat.trim() || undefined,
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Field definition">
      <Stack gap="md">
        <TextInput
          label="Field key"
          placeholder="invoice_number"
          value={fieldKey}
          onChange={(event) => setFieldKey(event.currentTarget.value)}
          required
          disabled={Boolean(initialValue)}
        />
        <Select
          label="Field type"
          data={fieldTypeOptions}
          value={fieldType}
          onChange={(value) => setFieldType(value as FieldType)}
        />
        <TextInput
          label="Format"
          placeholder="Optional format (dates, numbers)"
          value={fieldFormat}
          onChange={(event) => setFieldFormat(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!fieldKey.trim()}>
            Save field
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
