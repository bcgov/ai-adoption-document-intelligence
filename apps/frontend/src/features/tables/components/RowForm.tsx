import { DateTimePicker, MonthPickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { IconCalendar } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "mantine-form-zod-resolver";
import { useEffect } from "react";
import { apiService } from "@/data/services/api.service";
import {
  Button,
  DateInput,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  useForm,
} from "../../../ui";
import type { ColumnDef, TableRow } from "../types";
import { buildRowZodSchema } from "../utils/build-row-zod-schema";

interface Props {
  opened: boolean;
  onClose: () => void;
  groupId: string;
  tableId: string;
  columns: ColumnDef[];
  existing?: TableRow;
}

function defaultsFor(
  cols: ColumnDef[],
  existing?: TableRow,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    const existingValue = existing?.data[c.key];
    if (existingValue !== undefined) {
      if (c.type === "year-month" && typeof existingValue === "string") {
        // Picker expects "YYYY-MM-DD"; existing data is "YYYY-MM"
        out[c.key] = `${existingValue}-01`;
      } else if (c.type === "datetime" && typeof existingValue === "string") {
        // Picker expects "YYYY-MM-DD HH:mm:ss" (local); existing data is ISO
        const d = new Date(existingValue as string);
        const p = (n: number) => String(n).padStart(2, "0");
        out[c.key] =
          `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      } else {
        out[c.key] = existingValue;
      }
    } else if (c.type === "boolean") {
      out[c.key] = false;
    } else if (
      c.type === "date" ||
      c.type === "datetime" ||
      c.type === "year-month"
    ) {
      out[c.key] = null; // date pickers start empty
    } else {
      out[c.key] = "";
    }
  }
  return out;
}

export function RowForm({
  opened,
  onClose,
  groupId,
  tableId,
  columns,
  existing,
}: Props) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: defaultsFor(columns, existing),
    validate: zodResolver(buildRowZodSchema(columns)),
  });

  // Reset form (and any stale mutation error) when opened with different existing row
  useEffect(() => {
    if (opened) {
      form.setValues(defaultsFor(columns, existing));
      form.resetDirty();
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, existing?.id]);

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      // Strip empty/null optional fields; convert picker-native formats for the API
      const stripped: Record<string, unknown> = {};
      for (const c of columns) {
        const v = values[c.key];
        let serialized: unknown = v;
        if (c.type === "year-month" && typeof v === "string") {
          // Picker stores "YYYY-MM-DD"; API expects "YYYY-MM"
          serialized = v.substring(0, 7);
        } else if (c.type === "datetime" && typeof v === "string") {
          // Picker stores "YYYY-MM-DD HH:mm:ss" (local); API expects ISO UTC
          serialized = new Date(v.replace(" ", "T")).toISOString();
        }
        if (c.required) {
          stripped[c.key] = serialized;
        } else if (
          serialized !== "" &&
          serialized !== undefined &&
          serialized !== null
        ) {
          stripped[c.key] = serialized;
        }
      }

      if (existing) {
        const response = await apiService.patch(
          `/tables/${tableId}/rows/${existing.id}?group_id=${groupId}`,
          { data: stripped, expected_updated_at: existing.updated_at },
        );
        if (!response.success)
          throw new Error(response.message ?? "Failed to update row");
        return response.data;
      }
      const response = await apiService.post(
        `/tables/${tableId}/rows?group_id=${groupId}`,
        { data: stripped },
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to create row");
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["table-rows", groupId, tableId] });
      onClose();
    },
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={existing ? "Edit row" : "Create row"}
      size="lg"
    >
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          {columns.map((c) => {
            const props = form.getInputProps(c.key);
            switch (c.type) {
              case "string":
                return (
                  <TextInput
                    key={c.key}
                    label={c.label}
                    required={c.required}
                    {...props}
                  />
                );
              case "datetime":
                return (
                  <DateTimePicker
                    key={c.key}
                    label={c.label}
                    required={c.required}
                    valueFormat="YYYY-MM-DD HH:mm"
                    leftSection={<IconCalendar size={16} />}
                    leftSectionPointerEvents="none"
                    {...props}
                  />
                );
              case "number":
                return (
                  <NumberInput
                    key={c.key}
                    label={c.label}
                    required={c.required}
                    {...props}
                  />
                );
              case "boolean":
                return (
                  <Switch
                    key={c.key}
                    label={c.label}
                    {...props}
                    checked={!!props.value}
                  />
                );
              case "date":
                return (
                  <DateInput
                    key={c.key}
                    label={c.label}
                    description="Click the calendar icon to pick a date"
                    required={c.required}
                    valueFormat="YYYY-MM-DD"
                    leftSection={<IconCalendar size={16} />}
                    leftSectionPointerEvents="none"
                    {...props}
                  />
                );
              case "enum":
                return (
                  <Select
                    key={c.key}
                    label={c.label}
                    required={c.required}
                    data={c.enumValues ?? []}
                    {...props}
                  />
                );
              case "year-month":
                return (
                  <MonthPickerInput
                    key={c.key}
                    label={c.label}
                    required={c.required}
                    valueFormat="YYYY-MM"
                    leftSection={<IconCalendar size={16} />}
                    leftSectionPointerEvents="none"
                    {...props}
                  />
                );
              default: {
                // exhaustiveness check — this branch is unreachable at runtime
                c.type satisfies never;
                return null;
              }
            }
          })}
          {mutation.isError && (
            <Text c="red" size="sm">
              {(mutation.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
