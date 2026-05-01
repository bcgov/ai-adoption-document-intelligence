import type { ConditionExpression } from "../workflow/graph-workflow-types";

export type ColumnType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "enum";

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  enumValues?: string[];
}

export type PickStrategy = "first" | "last" | "one" | "all";

export interface LookupParam {
  name: string;
  type: ColumnType;
}

export interface OrderClause {
  field: string;
  direction: "asc" | "desc";
}

export interface LookupDef {
  name: string;
  params: LookupParam[];
  filter: ConditionExpression;
  order?: OrderClause[];
  pick: PickStrategy;
  templateId?: string;
  templateConfig?: Record<string, unknown>;
}
