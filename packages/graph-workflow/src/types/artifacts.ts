/**
 * Flat string-literal union per TYPED_IO_DESIGN.md §1 — parameterised entries
 * are enumerated, not structural.
 *
 * This module is the single canonical declaration of the typed-I/O vocabulary
 * for the visual workflow builder. Every surface (handle renderer, picker,
 * validator, future dynamic-node bridge) reads the same string-literal kind
 * names from here.
 *
 * The taxonomy is a rooted hierarchy with nominal subtyping:
 *
 *   Artifact (base)
 *   ├── Document
 *   │   ├── MultiPageDocument
 *   │   └── SinglePageDocument
 *   ├── Segment
 *   │   └── Segment<Kind> where Kind ∈ { Text, Table, Figure, Form,
 *   │                                    KeyValue, Signature, Header }
 *   ├── OcrResult
 *   │   ├── OcrFields
 *   │   └── OcrTable
 *   ├── Classification
 *   ├── ValidationResult
 *   └── Reference
 *
 * Cardinality is part of the type: `Document` vs `Document[]` are distinct
 * kinds. The `ArrayKind` template literal encodes the `[]` suffix; `KindRef`
 * is the union used wherever a port/ctx declaration declares its `kind?`.
 */

export type ArtifactKind =
  | "Artifact"
  | "Document"
  | "MultiPageDocument"
  | "SinglePageDocument"
  | "Segment"
  | "Segment<Text>"
  | "Segment<Table>"
  | "Segment<Figure>"
  | "Segment<Form>"
  | "Segment<KeyValue>"
  | "Segment<Signature>"
  | "Segment<Header>"
  | "OcrResult"
  | "OcrFields"
  | "OcrTable"
  | "Classification"
  | "ValidationResult"
  | "Reference";

/**
 * Array-cardinality form of `ArtifactKind`. A template-literal type that
 * produces every `${T}[]` permutation, so `Document[]` and `Segment<Table>[]`
 * are valid `ArrayKind` values.
 */
export type ArrayKind = `${ArtifactKind}[]`;

/**
 * Reference to a typed-I/O kind in either single or array cardinality.
 * Used everywhere a `kind?` is declared (activity `PortDescriptor`,
 * `CtxDeclaration`, `LibraryPortDescriptor`).
 */
export type KindRef = ArtifactKind | ArrayKind;

/**
 * Runtime provenance shape that rides along with every `Segment` artifact
 * instance via the ctx blackboard. The `kind?` field here is the 7-segment
 * semantic class — distinct from (and a subset of) the `ArtifactKind`
 * typed-I/O annotation surface.
 *
 * See TYPED_IO_DESIGN.md §1.
 */
export interface Segment {
  parentDocId: string;
  pageRange?: { start: number; end: number };
  polygon?: { x: number; y: number }[];
  kind?:
    | "Text"
    | "Table"
    | "Figure"
    | "Form"
    | "KeyValue"
    | "Signature"
    | "Header";
  confidence?: number;
  blobKey?: string;
}
