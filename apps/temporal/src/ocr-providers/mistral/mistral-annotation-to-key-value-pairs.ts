import type { KeyValuePair } from "../../types";

function valueToDisplayString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Parses Mistral `document_annotation` JSON string into Azure-shaped {@link KeyValuePair} rows
 * for {@link OCRResult.keyValuePairs} and downstream upsert/UI.
 */
export function mistralDocumentAnnotationToKeyValuePairs(
  documentAnnotation: string | null | undefined,
): KeyValuePair[] {
  if (documentAnnotation == null || documentAnnotation.trim() === "") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(documentAnnotation) as unknown;
  } catch {
    return [];
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const record = parsed as Record<string, unknown>;
  const pairs: KeyValuePair[] = [];

  for (const [fieldKey, rawVal] of Object.entries(record)) {
    const display = valueToDisplayString(rawVal);
    pairs.push({
      key: {
        content: fieldKey,
        boundingRegions: [],
        spans: [],
      },
      value: {
        content: display,
        boundingRegions: [],
        spans: [],
      },
      confidence: 1,
    });
  }

  return pairs;
}
