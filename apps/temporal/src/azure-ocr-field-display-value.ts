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

/**
 * Flatten `cleanedResult` / `ocrResult` to a per-field confidence map.
 * Returns `null` for fields where Azure DI did not provide a confidence score.
 * Mirrors the field traversal of `buildFlatPredictionMapFromCtx`.
 */
export function buildFlatConfidenceMapFromCtx(
  ctx: Record<string, unknown>,
): Record<string, number | null> {
  const ocrResult = (ctx.cleanedResult || ctx.ocrResult) as
    | {
        documents?: Array<{
          fields?: Record<string, Record<string, unknown>>;
        }>;
        keyValuePairs?: Array<{
          key?: { content?: string };
          value?: { content?: string };
          confidence?: number;
        }>;
      }
    | undefined;

  if (!ocrResult) return {};

  const out: Record<string, number | null> = {};

  if (
    ocrResult.documents &&
    ocrResult.documents.length > 0 &&
    ocrResult.documents[0].fields
  ) {
    for (const [key, value] of Object.entries(ocrResult.documents[0].fields)) {
      const c =
        value &&
        typeof value === "object" &&
        typeof value.confidence === "number"
          ? value.confidence
          : null;
      out[key] = c;
    }
    return out;
  }

  if (ocrResult.keyValuePairs && ocrResult.keyValuePairs.length > 0) {
    for (const pair of ocrResult.keyValuePairs) {
      const key = pair.key?.content || "unknown";
      out[key] = typeof pair.confidence === "number" ? pair.confidence : null;
    }
    return out;
  }

  return {};
}
