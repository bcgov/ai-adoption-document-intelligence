/**
 * Load TemplateModel.field_schema as a FieldMap for schema-aware OCR activities.
 */

import { getPrismaClient } from "./database-client";
import { buildFieldMap, type FieldMap } from "./enrichment-rules";

/**
 * Resolve field definitions for a TemplateModel id (same as ocr.enrich `documentType`).
 */
export async function loadFieldMapFromProject(
  documentType: string,
): Promise<FieldMap | null> {
  const prisma = getPrismaClient();
  const templateModel = await prisma.templateModel.findUnique({
    where: { id: documentType },
    include: { field_schema: { orderBy: { display_order: "asc" } } },
  });
  if (!templateModel?.field_schema?.length) return null;
  const defs = templateModel.field_schema.map(
    (f: {
      field_key: string;
      field_type: unknown;
      field_format: string | null;
      format_spec: string | null;
    }) => ({
      field_key: f.field_key,
      field_type: String(f.field_type),
      field_format: f.field_format,
      format_spec: f.format_spec,
    }),
  );
  return buildFieldMap(defs);
}
