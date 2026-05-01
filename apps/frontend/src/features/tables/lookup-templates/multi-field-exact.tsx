import {
  ActionIcon,
  Button,
  Group,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import type { ColumnDef } from "../types";
import type { LookupTemplate } from "./types";

interface Pair {
  column: string;
  param: string;
}

export const multiFieldExact: LookupTemplate = {
  id: "multi-field-exact",
  label: "Multi-field exact match",
  toLookupDef(name, v, columns) {
    const pairs = (v.pairs as Pair[] | undefined) ?? [];
    return {
      name,
      params: pairs.map((p) => ({
        name: p.param,
        type: columns.find((c) => c.key === p.column)?.type ?? "string",
      })),
      filter: {
        operator: "and",
        operands: pairs.map((p) => ({
          operator: "equals",
          left: { ref: `row.${p.column}` },
          right: { ref: `param.${p.param}` },
        })),
      } as never,
      pick: "one",
      templateId: "multi-field-exact",
      templateConfig: { pairs },
    };
  },
  fromLookupDef(l) {
    if (l.templateId === "multi-field-exact" && l.templateConfig)
      return l.templateConfig as Record<string, unknown>;
    return null;
  },
  renderFields({ columns, values, setValue }) {
    const pairs = (values.pairs as Pair[] | undefined) ?? [];
    const colData = columns.map((c: ColumnDef) => ({
      value: c.key,
      label: c.label,
    }));
    const update = (next: Pair[]) => setValue("pairs", next);
    return (
      <Stack>
        {pairs.map((p, i) => (
          <Group key={i} align="flex-end">
            <Select
              label={i === 0 ? "Column" : undefined}
              data={colData}
              value={p.column}
              onChange={(v) =>
                update(
                  pairs.map((q, j) =>
                    j === i ? { ...q, column: v ?? "" } : q,
                  ),
                )
              }
              flex={1}
            />
            <TextInput
              label={i === 0 ? "Param name" : undefined}
              value={p.param}
              onChange={(e) =>
                update(
                  pairs.map((q, j) =>
                    j === i ? { ...q, param: e.currentTarget.value } : q,
                  ),
                )
              }
              flex={1}
            />
            <ActionIcon
              color="red"
              variant="subtle"
              onClick={() => update(pairs.filter((_, j) => j !== i))}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="default"
          onClick={() => update([...pairs, { column: "", param: "" }])}
        >
          Add field
        </Button>
      </Stack>
    );
  },
};
