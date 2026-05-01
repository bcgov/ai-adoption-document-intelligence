import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  TagsInput,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect } from "react";
import type { ColumnDef, ColumnType } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  initial?: ColumnDef;
  onSubmit: (col: ColumnDef) => Promise<void>;
}

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "enum", label: "Enum" },
];

const DEFAULT_VALUES: ColumnDef = {
  key: "",
  label: "",
  type: "string",
  required: false,
};

export function ColumnForm({ opened, onClose, initial, onSubmit }: Props) {
  const form = useForm<ColumnDef>({
    initialValues: initial ?? DEFAULT_VALUES,
    validate: {
      key: (v) =>
        /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)
          ? null
          : "Letters, digits, underscore. Must start with letter/underscore.",
      label: (v) => (v.trim() ? null : "Required"),
      enumValues: (v, values) =>
        values.type === "enum" && (!v || v.length === 0)
          ? "At least one enum value required"
          : null,
    },
  });

  // Reset when reopening with different `initial`
  useEffect(() => {
    if (opened) {
      form.setValues(initial ?? DEFAULT_VALUES);
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initial?.key]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? "Edit Column" : "Add Column"}
    >
      <form
        onSubmit={form.onSubmit(async (v) => {
          // Strip enumValues unless type is enum
          const cleaned: ColumnDef = {
            key: v.key,
            label: v.label,
            type: v.type,
            required: v.required,
            ...(v.type === "enum" && v.enumValues
              ? { enumValues: v.enumValues }
              : {}),
          };
          await onSubmit(cleaned);
          onClose();
        })}
      >
        <Stack>
          <TextInput
            label="Key"
            required
            disabled={!!initial}
            description="Stable identifier — cannot change after creation"
            {...form.getInputProps("key")}
          />
          <TextInput label="Label" required {...form.getInputProps("label")} />
          <Select
            label="Type"
            required
            data={TYPE_OPTIONS}
            {...form.getInputProps("type")}
            allowDeselect={false}
          />
          {form.values.type === "enum" && (
            <TagsInput
              label="Enum values"
              description="Press Enter to add"
              {...form.getInputProps("enumValues")}
            />
          )}
          <Switch
            label="Required"
            {...form.getInputProps("required", { type: "checkbox" })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
