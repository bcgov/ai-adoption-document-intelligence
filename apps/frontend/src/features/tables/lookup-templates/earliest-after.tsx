import { Select, Stack, TextInput } from "@mantine/core";
import type { ColumnDef } from "../types";
import type { LookupTemplate } from "./types";

export const earliestAfter: LookupTemplate = {
  id: "earliest-after",
  label: "Earliest after / on",
  toLookupDef(name, v, columns) {
    const col = String(v.column);
    const param = String(v.param);
    const colDef = columns.find((c) => c.key === col);
    return {
      name,
      params: [{ name: param, type: colDef?.type ?? "string" }],
      filter: {
        operator: "lte",
        left: { ref: `param.${param}` },
        right: { ref: `row.${col}` },
      } as never,
      order: [{ field: col, direction: "asc" }],
      pick: "first",
      templateId: "earliest-after",
      templateConfig: { column: col, param },
    };
  },
  fromLookupDef(l) {
    if (l.templateId === "earliest-after" && l.templateConfig)
      return l.templateConfig as Record<string, unknown>;
    return null;
  },
  renderFields({ columns, values, setValue }) {
    return (
      <Stack>
        <Select
          label="Column"
          description="Find the earliest row whose value is ≥ the param"
          required
          data={columns.map((c: ColumnDef) => ({
            value: c.key,
            label: c.label,
          }))}
          value={(values.column as string) ?? null}
          onChange={(v) => setValue("column", v)}
        />
        <TextInput
          label="Param name"
          required
          value={(values.param as string) ?? ""}
          onChange={(e) => setValue("param", e.currentTarget.value)}
        />
      </Stack>
    );
  },
};
