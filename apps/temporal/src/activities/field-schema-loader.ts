/**
 * Load LabelingProject field_schema as a FieldMap for schema-aware OCR activities.
 */

import { getPrismaClient } from "./database-client";
import { buildFieldMap, type FieldMap } from "./enrichment-rules";

/**
 * Resolve field definitions for a LabelingProject id (same as ocr.enrich `documentType`).
 */
export async function loadFieldMapFromProject(
  documentType: string,
): Promise<FieldMap | null> {
  const prisma = getPrismaClient();
  const project = await prisma.labelingProject.findUnique({
    where: { id: documentType },
    include: { field_schema: { orderBy: { display_order: "asc" } } },
  });
  if (!project?.field_schema?.length) return null;
  const defs = project.field_schema.map(
    (f: {
      field_key: string;
      field_type: string;
      field_format: string | null;
    }) => ({
      field_key: f.field_key,
      field_type: f.field_type,
      field_format: f.field_format,
    }),
  );
  return buildFieldMap(defs);
}
