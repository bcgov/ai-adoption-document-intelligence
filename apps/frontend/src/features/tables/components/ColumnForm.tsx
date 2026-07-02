import { DateInput, DateTimePicker, MonthPickerInput } from "@mantine/dates";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  useForm,
} from "../../../ui";
import type { ColumnDef, ColumnType } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  initial?: ColumnDef;
  onSubmit: (col: ColumnDef, seedValue?: unknown) => Promise<void>;
}

type ColumnFormValues = ColumnDef & {
  unique: boolean;
  seed_value: string | number | boolean | null;
};

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "year-month", label: "Year-Month" },
  { value: "enum", label: "Enum" },
];

const DEFAULT_VALUES: ColumnFormValues = {
  key: "",
  label: "",
  type: "string",
  required: false,
  unique: false,
  seed_value: null,
};

export function ColumnForm({ opened, onClose, initial, onSubmit }: Props) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const form = useForm<ColumnFormValues>({
    initialValues: initial
      ? {
          ...initial,
          required: initial.required ?? false,
          unique: initial.unique ?? false,
          seed_value: null,
        }
      : DEFAULT_VALUES,
    validate: {
      key: (v) =>
        /^[a-z][a-z0-9_]*$/.test(v)
          ? null
          : "Lowercase letters, digits, underscore. must start with a letter.",
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
      form.setValues(
        initial
          ? {
              ...initial,
              required: initial.required ?? false,
              unique: initial.unique ?? false,
              seed_value: null,
            }
          : DEFAULT_VALUES,
      );
      form.resetDirty();
      setSaveError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initial?.key]);

  const showSeedInput = form.values.required === true && !form.values.unique;

  const seedInput = (() => {
    if (!showSeedInput) return null;
    const type = form.values.type;
    switch (type) {
      case "boolean":
        return (
          <Switch
            label="Seed value"
            checked={form.values.seed_value === true}
            onChange={(e) =>
              form.setFieldValue("seed_value", e.currentTarget.checked)
            }
          />
        );
      case "number":
        return (
          <NumberInput
            label="Seed value"
            value={
              typeof form.values.seed_value === "number"
                ? form.values.seed_value
                : ""
            }
            onChange={(v) =>
              form.setFieldValue("seed_value", v === "" ? null : (v as number))
            }
          />
        );
      case "date":
        return (
          <DateInput
            label="Seed value"
            valueFormat="YYYY-MM-DD"
            leftSection={<IconCalendar size={16} />}
            leftSectionPointerEvents="none"
            value={
              typeof form.values.seed_value === "string"
                ? form.values.seed_value
                : null
            }
            onChange={(v) => form.setFieldValue("seed_value", v)}
          />
        );
      case "datetime":
        return (
          <DateTimePicker
            label="Seed value"
            leftSection={<IconCalendar size={16} />}
            leftSectionPointerEvents="none"
            value={
              typeof form.values.seed_value === "string"
                ? form.values.seed_value
                : null
            }
            onChange={(v) => form.setFieldValue("seed_value", v)}
          />
        );
      case "year-month":
        return (
          <MonthPickerInput
            label="Seed value"
            leftSection={<IconCalendar size={16} />}
            leftSectionPointerEvents="none"
            value={
              typeof form.values.seed_value === "string"
                ? form.values.seed_value
                : null
            }
            onChange={(v) => form.setFieldValue("seed_value", v)}
          />
        );
      case "enum":
        return (
          <Select
            label="Seed value"
            data={form.values.enumValues ?? []}
            clearable
            value={
              typeof form.values.seed_value === "string"
                ? form.values.seed_value
                : null
            }
            onChange={(v) => form.setFieldValue("seed_value", v)}
          />
        );
      default:
        return (
          <TextInput
            label="Seed value"
            value={
              typeof form.values.seed_value === "string"
                ? form.values.seed_value
                : ""
            }
            onChange={(e) =>
              form.setFieldValue("seed_value", e.currentTarget.value)
            }
          />
        );
    }
  })();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? "Edit column" : "Add column"}
    >
      <form
        onSubmit={form.onSubmit(async (v) => {
          // Strip enumValues unless type is enum
          const cleaned: ColumnDef = {
            key: v.key,
            label: v.label,
            type: v.type,
            required: v.required,
            unique: v.unique || undefined,
            ...(v.type === "enum" && v.enumValues
              ? { enumValues: v.enumValues }
              : {}),
          };

          // Build the seed value with API-compatible formatting (for required columns only)
          let seedValue: unknown;
          if (
            v.required === true &&
            v.seed_value !== null &&
            v.seed_value !== undefined &&
            v.seed_value !== ""
          ) {
            if (
              v.type === "year-month" &&
              typeof v.seed_value === "string" &&
              v.seed_value.length >= 7
            ) {
              // MonthPickerInput stores "YYYY-MM-DD"; API expects "YYYY-MM"
              seedValue = v.seed_value.substring(0, 7);
            } else if (
              v.type === "datetime" &&
              typeof v.seed_value === "string"
            ) {
              // DateTimePicker stores "YYYY-MM-DD HH:mm:ss"; API expects ISO UTC
              seedValue = new Date(
                v.seed_value.replace(" ", "T"),
              ).toISOString();
            } else {
              seedValue = v.seed_value;
            }
          }

          setSaveError(null);
          setIsPending(true);
          try {
            await onSubmit(cleaned, seedValue);
            onClose();
          } catch (err) {
            setSaveError(err instanceof Error ? err.message : String(err));
          } finally {
            setIsPending(false);
          }
        })}
      >
        <Stack>
          <TextInput
            label="Key"
            required
            disabled={!!initial}
            description="Stable identifier, lowercase (e.g. total_amount) — cannot be changed after creation"
            {...form.getInputProps("key")}
          />
          <TextInput label="Label" required {...form.getInputProps("label")} />
          <Select
            label="Type"
            required
            data={TYPE_OPTIONS}
            {...form.getInputProps("type")}
            onChange={(v) => {
              form.setFieldValue("type", v as ColumnType);
              form.setFieldValue("seed_value", null);
            }}
            allowDeselect={false}
          />
          {form.values.type === "enum" && (
            <TagsInput
              label="Enum values"
              description="Press enter to add"
              {...form.getInputProps("enumValues")}
            />
          )}
          <Switch
            label="Required"
            {...form.getInputProps("required", { type: "checkbox" })}
            onChange={(e) => {
              form.setFieldValue("required", e.currentTarget.checked);
              if (!e.currentTarget.checked) {
                form.setFieldValue("seed_value", null);
              }
            }}
          />
          <Switch
            label="Unique"
            description="Each row must have a distinct value for this column"
            {...form.getInputProps("unique", { type: "checkbox" })}
            onChange={(e) => {
              form.setFieldValue("unique", e.currentTarget.checked);
              if (e.currentTarget.checked) {
                form.setFieldValue("seed_value", null);
              }
            }}
          />
          {showSeedInput && (
            <>
              <Alert
                icon={<IconInfoCircle size={16} />}
                color="blue"
                variant="light"
                title="Seed value for rows without this column"
              >
                This value will be written to all existing rows that are missing
                a value for this column.
              </Alert>
              {seedInput}
            </>
          )}
          {saveError && (
            <Text c="red" size="sm">
              {saveError}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
