/**
 * Builds an Azure Content Understanding analyzer JSON document from our
 * canonical TemplateModel `field_schema` rows.
 *
 * CU's analyzer schema vocabulary (per
 * https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/tutorial/create-custom-analyzer):
 *
 * - top-level `description` — the global instruction the analyzer carries.
 *   Plays the same role as Mistral's `document_annotation_prompt`.
 * - `baseAnalyzerId` — which prebuilt analyzer to inherit from. We use
 *   `prebuilt-document` (text + layout extraction).
 * - `fieldSchema.fields` — `{ FieldName: { type, method, description, … } }`.
 *   The per-field `description` plays the same role as the description
 *   overlay we apply to Mistral's JSON Schema.
 * - `config.returnDetails` / `config.estimateFieldSourceAndConfidence` —
 *   surface confidence + spans on every field, equivalent to Mistral
 *   strict-mode emission of structured fields.
 *
 * Field-type vocabulary mapping (our `FieldType` → CU `type` + `method`):
 *
 *   string         → string,  method=extract
 *   number         → number,  method=extract
 *   date           → date,    method=extract
 *   selectionMark  → string,  method=classify, enum=["selected","unselected"]
 *   signature      → string,  method=extract  (CU has no signature primitive)
 *
 * **Numeric nullability.** CU's documented type system allows null when no
 * value is present; the per-field description carries the blank-vs-zero
 * instruction. There is no schema-level `["number","null"]` union the way
 * Mistral's JSON Schema accepts, so the `numericFieldsNullable` toggle on
 * this builder takes a different shape: when on, we append a normative
 * sentence to each numeric field's description so the generative model
 * reliably emits null on blank cells. (Equivalent semantic effect; verified
 * in the iteration-kit smoke test before benchmark.)
 */

/** Aligns with Prisma FieldType enum values (mirror of mistral converter). */
export type TemplateFieldType =
  | "string"
  | "number"
  | "date"
  | "selectionMark"
  | "signature";

export interface CuTemplateFieldDefinitionInput {
  field_key: string;
  field_type: TemplateFieldType;
  field_format?: string | null;
}

export type CuFieldType = "string" | "number" | "date" | "object" | "array";
export type CuFieldMethod = "extract" | "classify" | "generate";

export interface CuFieldDefinition {
  type: CuFieldType;
  method: CuFieldMethod;
  description?: string;
  enum?: string[];
}

/** CU analyzer body shape sent to PUT /analyzers/{id}. */
export interface CuAnalyzerDefinition {
  description?: string;
  baseAnalyzerId: string;
  /**
   * Model bindings — references CU model aliases set via
   * `PATCH /contentunderstanding/defaults`. Using the canonical
   * `prebuilt-analyzer-*` aliases means this analyzer follows whatever
   * deployments the resource has wired up, so swapping completion model
   * (e.g. gpt-5.2 → gpt-4.1) is a single defaults call, not an analyzer
   * redeploy.
   */
  models: {
    completion: string;
    embedding: string;
  };
  config: {
    returnDetails: boolean;
    estimateFieldSourceAndConfidence: boolean;
  };
  fieldSchema: {
    fields: Record<string, CuFieldDefinition>;
  };
}

const NULLABLE_NUMERIC_HINT =
  " If the cell is completely blank (no number written), return null. Only return the number 0 if the cell explicitly shows a literal 0 / $0.";

export interface AnalyzerSchemaBuilderOptions {
  /**
   * Optional per-field description overlay, keyed by `field_key`. When set
   * (and non-empty), the description is attached to the CU field's
   * `description` property — this is the canonical way to disambiguate
   * fields beyond the field_key itself, and improves CU's extraction
   * accuracy on ambiguous forms. Missing or empty entries skip the
   * description for that field.
   */
  descriptions?: Record<string, string>;
  /**
   * Optional global instruction string. Set as the analyzer's top-level
   * `description` — it applies to every field. Equivalent role to Mistral's
   * `document_annotation_prompt`.
   */
  documentAnnotationPrompt?: string;
  /**
   * When true, every numeric field receives an extra normative sentence in
   * its `description` instructing the model to return null on blank cells
   * and the literal 0 only when the cell explicitly shows 0 / $0. CU's
   * type system permits null returns by default, but the generative model
   * needs the explicit instruction or it tends to default blanks to 0.
   */
  numericFieldsNullable?: boolean;
  /**
   * Base analyzer to inherit from. Defaults to `prebuilt-document` which
   * gives us OCR + layout + per-page content extraction.
   */
  baseAnalyzerId?: string;
  /**
   * Override the completion-model alias the analyzer references. Defaults
   * to `prebuilt-analyzer-completion` (the resource-default alias). Set to
   * a direct alias like `gpt-5.2` to lock the analyzer to that model.
   */
  completionModelAlias?: string;
  /**
   * Override the embedding-model alias. Defaults to
   * `prebuilt-analyzer-embedding`.
   */
  embeddingModelAlias?: string;
}

function fieldDefinitionForCu(
  field: CuTemplateFieldDefinitionInput,
  description: string | undefined,
  numericFieldsNullable: boolean,
): CuFieldDefinition {
  const trimmed = description?.trim();
  switch (field.field_type) {
    case "number": {
      const desc = numericFieldsNullable
        ? `${trimmed ?? ""}${NULLABLE_NUMERIC_HINT}`.trim()
        : trimmed;
      return desc
        ? { type: "number", method: "extract", description: desc }
        : { type: "number", method: "extract" };
    }
    case "string":
    case "signature": {
      return trimmed
        ? { type: "string", method: "extract", description: trimmed }
        : { type: "string", method: "extract" };
    }
    case "date": {
      return trimmed
        ? { type: "date", method: "extract", description: trimmed }
        : { type: "date", method: "extract" };
    }
    case "selectionMark": {
      const base: CuFieldDefinition = {
        type: "string",
        method: "classify",
        enum: ["selected", "unselected"],
      };
      return trimmed ? { ...base, description: trimmed } : base;
    }
  }
}

/**
 * Builds a CU analyzer JSON body from ordered field definitions. Returns
 * null when no fields are defined (caller should skip analyzer deployment
 * and fall back to OCR-only extraction).
 */
export function buildCuAnalyzerDefinition(
  fields: CuTemplateFieldDefinitionInput[],
  options?: AnalyzerSchemaBuilderOptions,
): CuAnalyzerDefinition | null {
  if (!fields.length) {
    return null;
  }
  const descriptions = options?.descriptions ?? {};
  const numericFieldsNullable = options?.numericFieldsNullable ?? false;
  const baseAnalyzerId = options?.baseAnalyzerId ?? "prebuilt-document";

  const cuFields: Record<string, CuFieldDefinition> = {};
  for (const f of fields) {
    const key = f.field_key.trim();
    if (!key) {
      continue;
    }
    cuFields[key] = fieldDefinitionForCu(
      f,
      descriptions[key],
      numericFieldsNullable,
    );
  }
  if (Object.keys(cuFields).length === 0) {
    return null;
  }

  const globalPrompt = options?.documentAnnotationPrompt?.trim();
  const completionModelAlias =
    options?.completionModelAlias ?? "prebuilt-analyzer-completion";
  const embeddingModelAlias =
    options?.embeddingModelAlias ?? "prebuilt-analyzer-embedding";

  return {
    ...(globalPrompt ? { description: globalPrompt } : {}),
    baseAnalyzerId,
    models: {
      completion: completionModelAlias,
      embedding: embeddingModelAlias,
    },
    config: {
      returnDetails: true,
      estimateFieldSourceAndConfidence: true,
    },
    fieldSchema: {
      fields: cuFields,
    },
  };
}

/**
 * Cheap deterministic hash so callers can detect whether the analyzer
 * definition changed since last deploy. Returns an 8-char hex string.
 */
export function hashCuAnalyzerDefinition(def: CuAnalyzerDefinition): string {
  const s = JSON.stringify(def);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
