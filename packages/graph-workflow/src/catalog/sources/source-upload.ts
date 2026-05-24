/**
 * `source.upload` — manual-pattern source catalog entry (US-116).
 *
 * Interactive intake: the canvas-side Dropzone (US-123) uploads a
 * file and the workflow runs against the resulting blob URL. The
 * uploaded file's URL is stored on the workflow ctx under the
 * configurable `ctxKey` (default `"documentUrl"`).
 *
 * `deriveOutputSchema` is pure — given the configured `ctxKey` it
 * returns the corresponding JSON Schema 7 object that `/run-spec`
 * (US-111) and `/runs` body validation consume. The configured key
 * is what the Phase 3 binding-walk validator (US-110) treats as a
 * producer of `kind: "Document"`.
 *
 * See docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md §3.2.
 */

import { z } from "zod/v4";

import type { JsonSchema7, SourceCatalogEntry } from "../source-types";

/** Default MIME glob list per DOCUMENT_SOURCES_DESIGN.md §3.2. */
const DEFAULT_ALLOWED_MIME_TYPES = ["application/pdf", "image/*"] as const;

/** Default maximum upload size in megabytes per the design. */
const DEFAULT_MAX_FILE_SIZE_MB = 50;

/**
 * Default ctx key for the uploaded blob URL. Matches the existing
 * OCR pipeline convention — not load-bearing (the user can rename
 * it), but a sensible Phase 8.0 default.
 */
const DEFAULT_CTX_KEY = "documentUrl";

/**
 * URL-safe identifier regex (mirrors `source-api.ts`). The ctx key
 * becomes a JSON property on the source's output object, so it must
 * be a valid JavaScript identifier-like string.
 */
const CTX_KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Static parameters for a `source.upload` node. Each field has a
 * Zod v4 `.default(...)` so `parametersSchema.parse({})` fills in
 * the documented defaults — this is how `deriveOutputSchema` and
 * the Run-drawer Dropzone (US-123) read the effective values.
 */
export const sourceUploadParametersSchema = z.object({
  allowedMimeTypes: z
    .array(z.string().min(1))
    .default([...DEFAULT_ALLOWED_MIME_TYPES])
    .meta({
      title: "Allowed MIME types",
      description:
        "MIME types accepted by the upload widget. Supports glob entries like \"image/*\".",
      "x-default": [...DEFAULT_ALLOWED_MIME_TYPES],
    }),
  maxFileSizeMB: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_MAX_FILE_SIZE_MB)
    .meta({
      title: "Max file size (MB)",
      description: "Maximum file size in megabytes.",
      "x-default": DEFAULT_MAX_FILE_SIZE_MB,
    }),
  ctxKey: z
    .string()
    .regex(CTX_KEY_REGEX, {
      message: "ctxKey must be a URL-safe identifier",
    })
    .default(DEFAULT_CTX_KEY)
    .meta({
      title: "Ctx key",
      description:
        "Name of the ctx key the resulting blob URL is stored under.",
      "x-default": DEFAULT_CTX_KEY,
    }),
});

/**
 * Pure derivation of the source's output JSON Schema from its
 * configured parameters. Throws if `parameters` doesn't shape-match
 * `sourceUploadParametersSchema` — callers are expected to have
 * run `createSourceParameterValidator` upstream.
 *
 * When `ctxKey` is absent from `parameters`, the schema's default
 * (`"documentUrl"`) is filled in by `.parse(...)` and used as the
 * property name on the returned JSON Schema.
 */
function deriveOutputSchema(
  parameters: Record<string, unknown>,
): JsonSchema7 {
  const parsed = sourceUploadParametersSchema.parse(parameters);
  return {
    type: "object",
    properties: {
      [parsed.ctxKey]: { type: "string", format: "uri" },
    },
    required: [parsed.ctxKey],
  };
}

export const sourceUploadCatalogEntry: SourceCatalogEntry = {
  type: "source.upload",
  category: "source",
  displayName: "File upload",
  description:
    "Interactive intake — the canvas-side Dropzone uploads a file and the workflow runs against the resulting blob URL.",
  iconHint: "file-upload",
  colorHint: "blue",
  parametersSchema: sourceUploadParametersSchema,
  runtime: "manual",
  deriveOutputSchema,
  outputKind: "Document",
};
