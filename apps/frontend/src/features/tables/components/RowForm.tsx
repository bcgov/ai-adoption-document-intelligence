import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { useForm } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "mantine-form-zod-resolver";
import { useEffect } from "react";
import { apiService } from "@/data/services/api.service";
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
      out[c.key] = existingValue;
    } else {
      out[c.key] = c.type === "boolean" ? false : "";
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

  // Reset form when opened with different existing row
  useEffect(() => {
    if (opened) {
      form.setValues(defaultsFor(columns, existing));
      form.resetDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, existing?.id]);

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      // Strip empty optional fields so the backend receives undefined, not ""
      const stripped: Record<string, unknown> = {};
      for (const c of columns) {
        const v = values[c.key];
        if (c.required) {
          stripped[c.key] = v;
        } else if (v !== "" && v !== undefined && v !== null) {
          stripped[c.key] = v;
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
      title={existing ? "Edit Row" : "Create Row"}
      size="lg"
    >
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          {columns.map((c) => {
            const props = form.getInputProps(c.key);
            switch (c.type) {
              case "string":
              case "datetime":
                return (
                  <TextInput
                    key={c.key}
                    label={c.label}
                    required={c.required}
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
                    required={c.required}
                    valueFormat="YYYY-MM-DD"
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
