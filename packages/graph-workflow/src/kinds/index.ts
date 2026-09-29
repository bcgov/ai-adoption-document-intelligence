/**
 * Ambient type aliases for the Phase 3 ArtifactKind registry — the source of
 * truth that dynamic-node TypeScript scripts import via the
 * `@ai-di/graph-workflow/kinds` subpath export (US-160).
 *
 * Each alias is a phantom-branded `Record<string, unknown>`. Model A keeps
 * `ctx` untyped at runtime; these aliases exist purely for compile-time
 * feedback (the agent's `deno check` revision loop, Monaco autocomplete in
 * the visual builder) and for nominal-typing-via-brand so a `Document` can't
 * be silently assigned to a `Segment` parameter even though both alias
 * `Record<string, unknown>`.
 *
 * Array variants (`SegmentArray`, etc.) are exported as ergonomic aliases so
 * a JSDoc kind string of `"Segment[]"` round-trips cleanly; TypeScript
 * callers can equivalently spell them as `Segment[]`.
 *
 * MUST stay in sync with apps/deno-runner/src/kinds.d.ts (the container-baked
 * copy used by `/check` when bundling the shared package isn't an option).
 */

type Brand<K extends string> = { readonly __kind: K };
type BrandedRecord<K extends string> = Record<string, unknown> & Brand<K>;

// Scalar kind aliases — must match REQUIREMENTS.md L19 exactly.
export type Document = BrandedRecord<"Document">;
export type Segment = BrandedRecord<"Segment">;
export type OcrResult = BrandedRecord<"OcrResult">;
export type Classification = BrandedRecord<"Classification">;
export type OcrTable = BrandedRecord<"OcrTable">;
export type OcrFields = BrandedRecord<"OcrFields">;
export type ValidationResult = BrandedRecord<"ValidationResult">;
export type Reference = BrandedRecord<"Reference">;
export type Artifact = BrandedRecord<"Artifact">;
export type SinglePageDocument = BrandedRecord<"SinglePageDocument">;
export type MultiPageDocument = BrandedRecord<"MultiPageDocument">;

// Array-variant aliases — ergonomic for JSDoc kind strings like "Segment[]".
export type DocumentArray = Document[];
export type SegmentArray = Segment[];
export type OcrResultArray = OcrResult[];
export type ClassificationArray = Classification[];
export type OcrTableArray = OcrTable[];
export type OcrFieldsArray = OcrFields[];
export type ValidationResultArray = ValidationResult[];
export type ReferenceArray = Reference[];
export type ArtifactArray = Artifact[];
export type SinglePageDocumentArray = SinglePageDocument[];
export type MultiPageDocumentArray = MultiPageDocument[];
