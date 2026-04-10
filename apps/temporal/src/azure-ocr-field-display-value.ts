/**
 * Azure Document Intelligence field display resolution (shared).
 *
 * Used by benchmark prediction flattening and ocr.normalizeFields empty coercion.
 */

export function extractAzureFieldDisplayValue(
  field: Record<string, unknown>,
): unknown {
  if (field.valueSelectionMark !== undefined) {
    return field.valueSelectionMark === "selected" ? "selected" : "unselected";
  }
  if (field.valueNumber !== undefined) {
    return field.valueNumber;
  }
  if (field.valueInteger !== undefined) {
    return field.valueInteger;
  }
  if (field.valueCurrency !== undefined) {
    const currency = field.valueCurrency as Record<string, unknown>;
    return currency.amount ?? field.content ?? null;
  }
  if (field.valueDate !== undefined) {
    return field.valueDate;
  }
  if (field.valueTime !== undefined) {
    return field.valueTime;
  }
  if (field.valueString !== undefined) {
    return field.valueString;
  }
  return field.content ?? null;
}

/**
 * Flatten `cleanedResult` / `ocrResult` to a key–value map for benchmark evaluation.
 * Does not coerce empty values; use `ocr.normalizeFields` with `emptyValueCoercion` when needed.
 */
export function buildFlatPredictionMapFromCtx(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  const ocrResult = (ctx.cleanedResult || ctx.ocrResult) as
    | {
        documents?: Array<{
          fields?: Record<string, Record<string, unknown>>;
        }>;
        keyValuePairs?: Array<{
          key?: { content?: string };
          value?: { content?: string };
        }>;
      }
    | undefined;

  if (!ocrResult) return {};

  const fields: Record<string, unknown> = {};

  if (
    ocrResult.documents &&
    ocrResult.documents.length > 0 &&
    ocrResult.documents[0].fields
  ) {
    for (const [key, value] of Object.entries(ocrResult.documents[0].fields)) {
      fields[key] =
        value && typeof value === "object"
          ? extractAzureFieldDisplayValue(value)
          : (value ?? null);
    }
    return fields;
  }

  if (ocrResult.keyValuePairs && ocrResult.keyValuePairs.length > 0) {
    for (const pair of ocrResult.keyValuePairs) {
      const key = pair.key?.content || "unknown";
      fields[key] = pair.value?.content ?? null;
    }
    return fields;
  }

  return {};
}
