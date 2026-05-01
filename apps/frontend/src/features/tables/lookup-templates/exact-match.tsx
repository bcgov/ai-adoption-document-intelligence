import { Select, Stack, TextInput } from "@mantine/core";
import type { ColumnDef } from "../types";
import type { LookupTemplate } from "./types";

export const exactMatch: LookupTemplate = {
  id: "exact-match",
  label: "Exact match",
  toLookupDef(name, v, columns) {
    const col = String(v.column);
    const param = String(v.param);
    const colDef = columns.find((c) => c.key === col);
    return {
      name,
      params: [{ name: param, type: colDef?.type ?? "string" }],
      filter: {
        operator: "equals",
        left: { ref: `row.${col}` },
        right: { ref: `param.${param}` },
      } as never,
      pick: "one",
      templateId: "exact-match",
      templateConfig: { column: col, param },
    };
  },
  fromLookupDef(l) {
    if (l.templateId === "exact-match" && l.templateConfig)
      return l.templateConfig as Record<string, unknown>;
    return null;
  },
  renderFields({ columns, values, setValue }) {
    return (
      <Stack>
        <Select
          label="Column to match"
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
          description="The lookup will accept a parameter with this name"
          required
          value={(values.param as string) ?? ""}
          onChange={(e) => setValue("param", e.currentTarget.value)}
        />
      </Stack>
    );
  },
};
