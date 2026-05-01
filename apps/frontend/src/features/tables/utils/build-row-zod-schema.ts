import { z } from "zod";
import type { ColumnDef } from "../types";

export function buildRowZodSchema(
  cols: ColumnDef[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of cols) {
    let base: z.ZodTypeAny;
    switch (c.type) {
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
        base = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
        break;
      case "datetime":
        base = z.string().datetime({ offset: true });
        break;
      case "enum": {
        const values = c.enumValues ?? [];
        if (values.length === 0) {
          throw new Error(`column "${c.key}": enum requires enumValues`);
        }
        base = z.enum(values as [string, ...string[]]);
        break;
      }
      default: {
        const _exhaustive: never = c.type;
        throw new Error(`unknown column type: ${_exhaustive}`);
      }
    }
    shape[c.key] = c.required ? base : base.optional();
  }
  return z.object(shape).strip();
}
