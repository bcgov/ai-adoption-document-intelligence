/**
 * Ambient type definitions for the Phase 3 ArtifactKind registry.
 *
 * Dynamic-node scripts `import type { Document, Segment, ... } from "@ai-di/graph-workflow/kinds"`.
 * The /check endpoint rewrites that import path to a sibling `./kinds.d.ts` (this file)
 * so `deno check` can resolve the names without bundling the full shared package.
 *
 * Each alias is a phantom-branded `Record<string, unknown>` — Model A keeps ctx
 * untyped at runtime; these are pure compile-time hints for the agent's revision
 * loop and Monaco autocomplete.
 *
 * MUST stay in sync with packages/graph-workflow/src/kinds/index.ts (US-160).
 */

type Brand<K extends string> = { readonly __kind: K };
type BrandedRecord<K extends string> = Record<string, unknown> & Brand<K>;

export type Artifact = BrandedRecord<"Artifact">;
export type Document = BrandedRecord<"Document">;
export type SinglePageDocument = BrandedRecord<"SinglePageDocument">;
export type MultiPageDocument = BrandedRecord<"MultiPageDocument">;
export type Segment = BrandedRecord<"Segment">;
export type OcrResult = BrandedRecord<"OcrResult">;
export type OcrFields = BrandedRecord<"OcrFields">;
export type OcrTable = BrandedRecord<"OcrTable">;
export type Classification = BrandedRecord<"Classification">;
export type ValidationResult = BrandedRecord<"ValidationResult">;
export type Reference = BrandedRecord<"Reference">;

export type ArtifactArray = Artifact[];
export type DocumentArray = Document[];
export type SinglePageDocumentArray = SinglePageDocument[];
export type MultiPageDocumentArray = MultiPageDocument[];
export type SegmentArray = Segment[];
export type OcrResultArray = OcrResult[];
export type OcrFieldsArray = OcrFields[];
export type OcrTableArray = OcrTable[];
export type ClassificationArray = Classification[];
export type ValidationResultArray = ValidationResult[];
export type ReferenceArray = Reference[];
