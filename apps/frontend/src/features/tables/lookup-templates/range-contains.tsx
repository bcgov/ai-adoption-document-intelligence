import { Select, Stack, TextInput } from "../../../ui";
import type { ColumnDef } from "../types";
import type { LookupTemplate } from "./types";

export const rangeContains: LookupTemplate = {
  id: "range-contains",
  label: "Range contains value",
  description:
    "Returns a row whose start and end columns bracket the value you pass in — e.g. find the tax band that contains a given income.",
  toLookupDef(name, v, columns) {
    const start = String(v.startColumn);
    const end = String(v.endColumn);
    const param = String(v.param);
    const startDef = columns.find((c) => c.key === start);
    return {
      name,
      params: [{ name: param, type: startDef?.type ?? "string" }],
      filter: {
        operator: "and",
        operands: [
          {
            operator: "lte",
            left: { ref: `row.${start}` },
            right: { ref: `param.${param}` },
          },
          {
            operator: "lte",
            left: { ref: `param.${param}` },
            right: { ref: `row.${end}` },
          },
        ],
      } as never,
      pick: "one",
      templateId: "range-contains",
      templateConfig: { startColumn: start, endColumn: end, param },
    };
  },
  fromLookupDef(l) {
    if (l.templateId === "range-contains" && l.templateConfig)
      return l.templateConfig as Record<string, unknown>;
    return null;
  },
  renderFields({ columns, values, setValue }) {
    const colData = columns.map((c: ColumnDef) => ({
      value: c.key,
      label: c.label,
    }));
    return (
      <Stack>
        <Select
          label="Range start column"
          description="The column that stores the lower bound of the range"
          required
          data={colData}
          value={(values.startColumn as string) ?? null}
          onChange={(v) => setValue("startColumn", v)}
        />
        <Select
          label="Range end column"
          description="The column that stores the upper bound of the range"
          required
          data={colData}
          value={(values.endColumn as string) ?? null}
          onChange={(v) => setValue("endColumn", v)}
        />
        <TextInput
          label="Param name"
          description="Name this input — the workflow supplies a value for it at runtime (e.g. income, check_date)"
          required
          value={(values.param as string) ?? ""}
          onChange={(e) => setValue("param", e.currentTarget.value)}
        />
      </Stack>
    );
  },
};
