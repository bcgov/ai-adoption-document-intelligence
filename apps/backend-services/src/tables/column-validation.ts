import { z } from "zod";
import type { ColumnDef } from "./types";

const KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateColumnDefs(cols: ColumnDef[]): void {
  const seen = new Set<string>();
  for (const col of cols) {
    if (!KEY_PATTERN.test(col.key)) {
      throw new Error(
        `invalid column key "${col.key}": must match ${KEY_PATTERN}`,
      );
    }
    if (seen.has(col.key)) {
      throw new Error(`duplicate column key "${col.key}"`);
    }
    seen.add(col.key);
    if (col.type === "enum") {
      if (!col.enumValues || col.enumValues.length === 0) {
        throw new Error(
          `column "${col.key}": enumValues required for type enum`,
        );
      }
    } else if (col.enumValues !== undefined) {
      throw new Error(
        `column "${col.key}": enumValues only allowed for type enum`,
      );
    }
  }
}

function zodForColumn(col: ColumnDef): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (col.type) {
    case "string":
      base = z.string();
      break;
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "date":
      base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      break;
    case "datetime":
      base = z.string().datetime({ offset: true });
      break;
    case "enum":
      base = z.enum(col.enumValues as [string, ...string[]]);
      break;
    default: {
      const _exhaustive: never = col.type;
      throw new Error(`unknown column type: ${_exhaustive}`);
    }
  }
  return col.required ? base : base.optional();
}

export function buildRowZodSchema(
  cols: ColumnDef[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const col of cols) {
    shape[col.key] = zodForColumn(col);
  }
  // .strip() drops unknown keys silently (default in Zod, but explicit here for clarity)
  return z.object(shape).strip();
}
