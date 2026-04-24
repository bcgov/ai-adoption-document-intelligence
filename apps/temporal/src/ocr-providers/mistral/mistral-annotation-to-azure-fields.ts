/**
 * Maps Mistral `document_annotation` JSON + TemplateModel.field_schema into
 * Azure-shaped `documents[0].fields` and parallel `keyValuePairs`, matching
 * custom-model OCR storage, upsert, enrichment, and benchmark flattening.
 */

import { extractAzureFieldDisplayValue } from "../../azure-ocr-field-display-value";
import type {
  AzureDocument,
  AzureDocumentFieldValue,
  KeyValuePair,
} from "../../types";
import { mistralDocumentAnnotationToKeyValuePairs } from "./mistral-annotation-to-key-value-pairs";

export interface MistralFieldDefRow {
  field_key: string;
  field_type: string;
  field_format?: string | null;
}

function parseAnnotationObject(
  documentAnnotation: string | null | undefined,
): Record<string, unknown> | null {
  if (documentAnnotation == null || documentAnnotation.trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(documentAnnotation) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeSelectionMark(raw: unknown): "selected" | "unselected" {
  if (raw === true) return "selected";
  if (raw === false) return "unselected";
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (
      s === "selected" ||
      s === "yes" ||
      s === "true" ||
      s === "☑" ||
      s === "x"
    ) {
      return "selected";
    }
    return "unselected";
  }
  return "unselected";
}

/**
 * Build one Azure field value from a raw JSON value and labeling `field_type`.
 */
export function rawValueToAzureDocumentFieldValue(
  raw: unknown,
  fieldType: string,
): AzureDocumentFieldValue {
  const confidence = 1;

  switch (fieldType) {
    case "number": {
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return {
          type: "number",
          content: String(raw),
          valueString: String(raw),
          valueNumber: raw,
          confidence,
        };
      }
      const s =
        typeof raw === "string"
          ? raw
          : raw == null || raw === undefined
            ? ""
            : String(raw);
      const normalized = s.replace(/,/g, "").trim();
      const n = parseFloat(normalized);
      if (!Number.isNaN(n) && normalized !== "") {
        return {
          type: "number",
          content: s,
          valueString: String(n),
          valueNumber: n,
          confidence,
        };
      }
      return {
        type: "number",
        content: s,
        valueString: s,
        confidence,
      };
    }
    case "selectionMark": {
      const sel = normalizeSelectionMark(raw);
      const display = sel === "selected" ? "selected" : "unselected";
      return {
        type: "selectionMark",
        content: display,
        valueString: display,
        valueSelectionMark: sel,
        confidence,
      };
    }
    case "date": {
      const s =
        typeof raw === "string"
          ? raw
          : raw == null || raw === undefined
            ? ""
            : String(raw);
      return {
        type: "date",
        content: s,
        valueString: s,
        valueDate: s,
        confidence,
      };
    }
    case "signature": {
      const s =
        typeof raw === "string"
          ? raw
          : raw == null || raw === undefined
            ? ""
            : String(raw);
      return {
        type: "signature",
        content: s,
        valueString: s,
        confidence,
      };
    }
    default: {
      const s =
        typeof raw === "string"
          ? raw
          : raw == null || raw === undefined
            ? ""
            : typeof raw === "number" || typeof raw === "boolean"
              ? String(raw)
              : JSON.stringify(raw);
      return {
        type: "string",
        content: s,
        valueString: s,
        confidence,
      };
    }
  }
}

function azureFieldToKeyValuePair(
  fieldKey: string,
  field: AzureDocumentFieldValue,
): KeyValuePair {
  const display = String(
    extractAzureFieldDisplayValue(field as Record<string, unknown>) ?? "",
  );
  return {
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
    confidence: typeof field.confidence === "number" ? field.confidence : 1,
  };
}

/**
 * When `fieldDefs` is non-empty (same order as `field_schema`), builds
 * `documents[0].fields` with typed Azure-style values and matching
 * `keyValuePairs` for enrichment / LLM merge paths.
 *
 * When `fieldDefs` is empty, falls back to string-only key–value pairs from
 * {@link mistralDocumentAnnotationToKeyValuePairs}.
 */
export function mistralAnnotationToDocumentsAndKeyValuePairs(
  documentAnnotation: string | null | undefined,
  fieldDefs: MistralFieldDefRow[],
): {
  documents: AzureDocument[] | undefined;
  keyValuePairs: KeyValuePair[];
} {
  if (!fieldDefs.length) {
    return {
      documents: undefined,
      keyValuePairs:
        mistralDocumentAnnotationToKeyValuePairs(documentAnnotation),
    };
  }

  const parsed = parseAnnotationObject(documentAnnotation);
  const fields: Record<string, AzureDocumentFieldValue> = {};

  for (const def of fieldDefs) {
    const key = def.field_key.trim();
    if (!key) continue;
    const raw = parsed ? parsed[key] : undefined;
    fields[key] = rawValueToAzureDocumentFieldValue(raw, def.field_type);
  }

  const keyValuePairs = Object.entries(fields).map(([k, v]) =>
    azureFieldToKeyValuePair(k, v),
  );

  const documents: AzureDocument[] = [
    {
      docType: "mistral-template",
      fields,
      confidence: 1,
    },
  ];

  return { documents, keyValuePairs };
}
