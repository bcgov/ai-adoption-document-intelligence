import type { ReactNode } from "react";
import type { ColumnDef, LookupDef } from "../types";

export interface LookupTemplate {
  id: string;
  label: string;
  /** One-sentence plain-English explanation shown below the template selector. */
  description: string;
  toLookupDef(
    name: string,
    values: Record<string, unknown>,
    columns: ColumnDef[],
  ): LookupDef;
  fromLookupDef(lookup: LookupDef): Record<string, unknown> | null;
  renderFields(args: {
    columns: ColumnDef[];
    values: Record<string, unknown>;
    setValue: (key: string, v: unknown) => void;
  }): ReactNode;
}
