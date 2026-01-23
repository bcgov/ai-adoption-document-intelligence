import { FC, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { FieldDefinition, FieldType, TableType } from "../../core/types/field";

interface FieldSchemaEditorProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: {
    field_key: string;
    field_type: FieldType;
    field_format?: string;
    display_order?: number;
    is_required?: boolean;
    is_table?: boolean;
    table_type?: TableType;
    column_headers?: Array<{ name: string; type: FieldType }>;
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
  const [required, setRequired] = useState(false);
  const [tableType, setTableType] = useState<TableType>(TableType.DYNAMIC);
  const [columnHeaders, setColumnHeaders] = useState("");

  useEffect(() => {
    if (opened) {
      setFieldKey(initialValue?.fieldKey || "");
      setFieldType(initialValue?.fieldType || FieldType.STRING);
      setFieldFormat(initialValue?.fieldFormat || "");
      setRequired(initialValue?.isRequired ?? false);
      setTableType(initialValue?.tableType || TableType.DYNAMIC);
      setColumnHeaders(
        initialValue?.columnHeaders?.map((col) => col.name).join(", ") || "",
      );
    }
  }, [initialValue, opened]);

  const isTable = fieldType === FieldType.TABLE;

  const fieldTypeOptions = useMemo(
    () =>
      Object.values(FieldType).map((value) => ({
        value,
        label: value,
      })),
    [],
  );

  const tableTypeOptions = useMemo(
    () =>
      Object.values(TableType).map((value) => ({
        value,
        label: value,
      })),
    [],
  );

  const handleSubmit = () => {
    const columns = columnHeaders
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, type: FieldType.STRING }));

    onSubmit({
      field_key: fieldKey.trim(),
      field_type: fieldType,
      field_format: fieldFormat.trim() || undefined,
      is_required: required,
      is_table: isTable,
      table_type: isTable ? tableType : undefined,
      column_headers: isTable && columns.length > 0 ? columns : undefined,
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
        <Checkbox
          label="Required"
          checked={required}
          onChange={(event) => setRequired(event.currentTarget.checked)}
        />
        {isTable && (
          <>
            <Select
              label="Table type"
              data={tableTypeOptions}
              value={tableType}
              onChange={(value) => setTableType(value as TableType)}
            />
            <TextInput
              label="Column headers"
              placeholder="Column A, Column B, Column C"
              value={columnHeaders}
              onChange={(event) => setColumnHeaders(event.currentTarget.value)}
            />
          </>
        )}
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
