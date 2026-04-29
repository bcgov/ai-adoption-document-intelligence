// Mirror of backend types — keep in sync with apps/backend-services/src/tables/types.ts.

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
  unique?: boolean;
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
  filter: Record<string, unknown>;
  order?: OrderClause[];
  pick: PickStrategy;
  templateId?: string;
  templateConfig?: Record<string, unknown>;
}

export interface TableSummary {
  id: string;
  group_id: string;
  table_id: string;
  label: string;
  description?: string | null;
  row_count: number;
  updated_at: string;
}

export interface TableDetail {
  id: string;
  group_id: string;
  table_id: string;
  label: string;
  description?: string | null;
  columns: ColumnDef[];
  lookups: LookupDef[];
  updated_at: string;
}

export interface TableRow {
  id: string;
  group_id: string;
  table_id: string;
  data: Record<string, unknown>;
  updated_at: string;
}
