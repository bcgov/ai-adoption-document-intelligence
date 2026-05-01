import {
  ActionIcon,
  Button,
  Group,
  JsonInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type {
  ColumnType,
  LookupParam,
  OrderClause,
  PickStrategy,
} from "../types";
import type { LookupTemplate } from "./types";

const PICK_OPTIONS: { value: PickStrategy; label: string }[] = [
  { value: "first", label: "First match" },
  { value: "last", label: "Last match" },
  { value: "one", label: "Exactly one" },
  { value: "all", label: "All matches" },
];

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Datetime" },
  { value: "enum", label: "Enum" },
];

export const customJson: LookupTemplate = {
  id: "custom-json",
  label: "Custom (advanced)",
  toLookupDef(name, v) {
    const filterText = (v.filterJson as string) ?? "{}";
    let filter: Record<string, unknown>;
    try {
      filter = JSON.parse(filterText);
    } catch {
      throw new Error("filter must be valid JSON");
    }
    return {
      name,
      params: ((v.params as LookupParam[]) ?? []).filter((p) => p.name),
      filter: filter as never,
      order: ((v.order as OrderClause[]) ?? []).filter((o) => o.field),
      pick: (v.pick as PickStrategy) ?? "first",
      templateId: "custom-json",
    };
  },
  fromLookupDef(l) {
    return {
      filterJson: JSON.stringify(l.filter, null, 2),
      params: l.params,
      order: l.order ?? [],
      pick: l.pick,
    };
  },
  renderFields({ values, setValue }) {
    const params = (values.params as LookupParam[] | undefined) ?? [];
    const order = (values.order as OrderClause[] | undefined) ?? [];
    return (
      <Stack>
        <Stack gap="xs">
          <Group justify="space-between">
            <strong>Params</strong>
            <Button
              size="xs"
              variant="default"
              onClick={() =>
                setValue("params", [...params, { name: "", type: "string" }])
              }
            >
              Add param
            </Button>
          </Group>
          {params.map((p, i) => (
            <Group key={i} align="flex-end">
              <TextInput
                label={i === 0 ? "Name" : undefined}
                value={p.name}
                onChange={(e) =>
                  setValue(
                    "params",
                    params.map((q, j) =>
                      j === i ? { ...q, name: e.currentTarget.value } : q,
                    ),
                  )
                }
                flex={1}
              />
              <Select
                label={i === 0 ? "Type" : undefined}
                data={TYPE_OPTIONS}
                value={p.type}
                onChange={(v) =>
                  setValue(
                    "params",
                    params.map((q, j) =>
                      j === i
                        ? { ...q, type: (v ?? "string") as ColumnType }
                        : q,
                    ),
                  )
                }
                flex={1}
              />
              <ActionIcon
                color="red"
                variant="subtle"
                onClick={() =>
                  setValue(
                    "params",
                    params.filter((_, j) => j !== i),
                  )
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
        <JsonInput
          label="Filter (ConditionExpression JSON)"
          description="Raw filter tree. Use param.X / row.X refs."
          autosize
          minRows={6}
          formatOnBlur
          validationError="Invalid JSON"
          value={(values.filterJson as string) ?? ""}
          onChange={(v) => setValue("filterJson", v)}
        />
        <Stack gap="xs">
          <Group justify="space-between">
            <strong>Order</strong>
            <Button
              size="xs"
              variant="default"
              onClick={() =>
                setValue("order", [...order, { field: "", direction: "asc" }])
              }
            >
              Add order
            </Button>
          </Group>
          {order.map((o, i) => (
            <Group key={i} align="flex-end">
              <TextInput
                label={i === 0 ? "Field" : undefined}
                value={o.field}
                onChange={(e) =>
                  setValue(
                    "order",
                    order.map((x, j) =>
                      j === i ? { ...x, field: e.currentTarget.value } : x,
                    ),
                  )
                }
                flex={1}
              />
              <Select
                label={i === 0 ? "Direction" : undefined}
                data={[
                  { value: "asc", label: "asc" },
                  { value: "desc", label: "desc" },
                ]}
                value={o.direction}
                onChange={(v) =>
                  setValue(
                    "order",
                    order.map((x, j) =>
                      j === i
                        ? { ...x, direction: (v ?? "asc") as "asc" | "desc" }
                        : x,
                    ),
                  )
                }
                flex={1}
              />
              <ActionIcon
                color="red"
                variant="subtle"
                onClick={() =>
                  setValue(
                    "order",
                    order.filter((_, j) => j !== i),
                  )
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
        <Select
          label="Pick strategy"
          required
          data={PICK_OPTIONS}
          value={(values.pick as string) ?? "first"}
          onChange={(v) => setValue("pick", v)}
          allowDeselect={false}
        />
      </Stack>
    );
  },
};
