/**
 * Shared TypeScript types for the Phase 6 dynamic-node signature DSL.
 *
 * Consumed by:
 *  - the publish endpoint (`POST` / `PUT /api/dynamic-nodes`)
 *  - the frontend signature-preview pane in the in-editor live parser
 *  - the Prisma JSON-column typed read on `DynamicNodeVersion.signature`
 *  - the Phase 7 agent's tool-call surface
 *
 * No runtime code lives here — pure types. The parser implementation (US-158)
 * produces values of these shapes. The Prisma model (US-162) declares
 * `signature` as `Json`; TypeScript callers cast to `DynamicNodeSignature`
 * after reading.
 */

/**
 * A single declared input or output port on a dynamic node.
 *
 * `kind` is an `ArtifactKind` name (or `<Kind>[]` for arrays) from the
 * Phase 3 typed-I/O registry. The parser cross-checks `kind` against the
 * registry; unknown kinds surface as a `signature-semantics` `ParseError`
 * with `unknownKind` populated.
 */
export interface DynamicNodePort {
  name: string;
  kind: string;
  required?: boolean;
  description?: string;
}

/**
 * The parsed JSDoc signature of a dynamic-node script.
 *
 * Carries every field derivable from the JSDoc header tags
 * (`@name`, `@description`, `@category`, `@deterministic`, `@inputs`,
 * `@outputs`, `@parameters`, `@allowNet`, `@timeoutMs`, `@maxMemoryMB`).
 *
 * Stored on `DynamicNodeVersion.signature` as JSON.
 */
export interface DynamicNodeSignature {
  name: string;
  description: string;
  category: string;
  deterministic: boolean;
  inputs: DynamicNodePort[];
  outputs: DynamicNodePort[];
  /** JSON Schema 7 built from the `@parameters` JSDoc declaration. */
  paramsSchema: Record<string, unknown>;
  allowNet: string[];
  timeoutMs: number;
  maxMemoryMB: number;
}

/**
 * The shape of a `DynamicNodeVersion` row when read out of the database.
 *
 * Mirrors the Prisma row shape (US-162) with `signature` typed as the
 * parsed `DynamicNodeSignature` rather than raw JSON. Callers cast the
 * Prisma `Json` value to this type after fetching.
 */
export interface DynamicNodeVersionRecord {
  versionNumber: number;
  script: string;
  signature: DynamicNodeSignature;
  allowNet: string[];
  deterministic: boolean;
  publishedByUserId?: string;
  /** ISO 8601 timestamp. */
  publishedAt: string;
}

/**
 * A structured publish-time parse error.
 *
 * Discriminated by `stage` over the four publish-time validation stages:
 *  - `jsdoc-parse`         — JSDoc header could not be parsed
 *  - `signature-semantics` — JSDoc parsed but a declared kind / slug / params shape is invalid
 *  - `ts-check`            — `deno check` reported a TypeScript error in the script body
 *  - `allowlist`           — a host in `@allowNet` is not in the global allowlist
 *
 * Each variant carries only the optional fields meaningful at its stage.
 */
export type ParseError =
  | JsDocParseError
  | SignatureSemanticsError
  | TsCheckError
  | AllowlistError;

export interface JsDocParseError {
  stage: "jsdoc-parse";
  message: string;
  line?: number;
  column?: number;
  /** The offending JSDoc tag, e.g. `"@inputs"`. */
  tag?: string;
}

export interface SignatureSemanticsError {
  stage: "signature-semantics";
  message: string;
  line?: number;
  column?: number;
  /** The offending JSDoc tag, e.g. `"@inputs"`. */
  tag?: string;
  /** Populated when a declared `kind` is absent from the `ArtifactKind` registry. */
  unknownKind?: string;
}

export interface TsCheckError {
  stage: "ts-check";
  message: string;
  line?: number;
  column?: number;
}

export interface AllowlistError {
  stage: "allowlist";
  message: string;
  /** The host pattern from `@allowNet` that is not in the global allowlist. */
  rejectedHost?: string;
}
