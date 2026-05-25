/**
 * `parseDynamicNodeSignature` — Phase 6 dynamic-node parser.
 *
 * Pure function (no I/O, no side effects) that scans a TypeScript script for
 * its top-of-file JSDoc header and returns either a fully-assembled
 * `ActivityCatalogEntry` for the dynamic node OR a structured list of
 * `ParseError`s describing what failed.
 *
 * Two stages run in order, short-circuiting at the first failing stage:
 *   1. `jsdoc-parse` — locate + tokenize the JSDoc header (US-158).
 *   2. `signature-semantics` — slug regex check, kind-registry cross-check,
 *      `@parameters` → JSON Schema 7 coercion, defaults + caps, derived
 *      `ActivityCatalogEntry` assembly (US-159).
 *
 * The remaining two stages (`ts-check` via `deno check` + `allowlist`
 * intersection against the global `DYNAMIC_NODE_ALLOW_NET` env var) are
 * backend-only (US-164) and not part of this pure-function surface.
 *
 * Authoritative spec:
 *   - feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md
 *     §3.3 L17 (shared-package contract) + L18 (recognized tag list + defaults).
 *   - docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md §2 (full JSDoc example
 *     + tag table) + §2.2 (parser output shape).
 *
 * Runs CLIENT-SIDE as well as in Node — no node-only modules. The shared
 * package is bundled into the frontend Vite build.
 */

import JSON5 from "json5";

import type { ActivityCatalogEntry, PortDescriptor } from "../catalog/types";
import type { KindRef } from "../types/artifacts";
import { getArtifactKindMeta } from "../types/artifact-registry";
import type { JsDocParseError, ParseError, SignatureSemanticsError } from "./types";

/**
 * Per-tag JSDoc value with the 1-based source line it was found on.
 *
 * `line` points at the line containing the `@<tag>` marker itself.
 */
export interface JsDocTagValue<T> {
  value: T;
  line: number;
}

/**
 * Structured per-tag record produced by the JSDoc-parse stage.
 *
 * Every recognized tag is optional at the parse layer — missing-required
 * tags surface as `ParseError`s rather than throwing. Values for the
 * object/array tags (`inputs`, `outputs`, `parameters`, `allowNet`) are
 * returned RAW (`unknown`); semantics validation refines them in US-159.
 */
export interface ParsedJsDocBlock {
  /** Whether the `@workflow-node` marker tag was present. */
  hasMarker: boolean;
  name?: JsDocTagValue<string>;
  description?: JsDocTagValue<string>;
  category?: JsDocTagValue<string>;
  deterministic?: JsDocTagValue<boolean>;
  inputs?: JsDocTagValue<unknown>;
  outputs?: JsDocTagValue<unknown>;
  parameters?: JsDocTagValue<unknown>;
  allowNet?: JsDocTagValue<unknown>;
  timeoutMs?: JsDocTagValue<number>;
  maxMemoryMB?: JsDocTagValue<number>;
}

/**
 * Result of locating + decoding the top-of-file JSDoc block.
 *
 * `block` is `null` when no `/** ... *\/` JSDoc block precedes any non-blank,
 * non-comment line at the top of the file.
 */
interface JsDocBlockLocation {
  /** 1-based line of the opening `/**`. */
  startLine: number;
  /** 1-based line of the closing `*\/`. */
  endLine: number;
  /**
   * Per-line content of the JSDoc block AFTER stripping leading `*` and
   * surrounding whitespace. Index 0 corresponds to `startLine`.
   */
  lines: string[];
}

/** The recognized tag names, in declaration order. */
const RECOGNIZED_TAGS = [
  "@workflow-node",
  "@name",
  "@description",
  "@category",
  "@deterministic",
  "@inputs",
  "@outputs",
  "@parameters",
  "@allowNet",
  "@timeoutMs",
  "@maxMemoryMB",
] as const;

/** Tags whose VALUE is a JSON-ish object or array. */
const JSON_VALUE_TAGS = new Set<string>([
  "@inputs",
  "@outputs",
  "@parameters",
  "@allowNet",
]);

/** Tags REQUIRED in every dynamic-node signature. */
const REQUIRED_TAGS: ReadonlyArray<"@name" | "@description" | "@inputs" | "@outputs"> =
  ["@name", "@description", "@inputs", "@outputs"];

/**
 * Locates the first `/** ... *\/` JSDoc block at the top of the file.
 *
 * Per DYNAMIC_NODES_DESIGN.md §2 the JSDoc block sits at the top of the
 * file alongside the default-exported function. Imports and line comments
 * may precede the block (the canonical example imports `Document` from
 * `@ai-di/graph-workflow/kinds` immediately before the block). Anything
 * after the first declaration / function body is NOT a candidate.
 *
 * Algorithm: scan line-by-line for the first `/** ` opener. Stop scanning
 * as soon as we encounter a line whose first non-whitespace content looks
 * like an `export` / `function` / `class` / `const` / `let` / `var`
 * declaration — those are the bodies the JSDoc would document.
 *
 * Returns `null` if no JSDoc block is found before the first declaration.
 *
 * Note (L17 + scenario 5): `// @workflow-node` style line comments do NOT
 * count as a JSDoc block. Only the standard `/** ... *\/` form is accepted.
 * Plain `/* ... *\/` block comments (not `/** ... *\/`) also do NOT count.
 */
function findTopOfFileJsDocBlock(script: string): JsDocBlockLocation | null {
  const sourceLines = script.split(/\r?\n/);
  // Declarations after which we should stop searching for a JSDoc header.
  // We do NOT include `import` here — imports can precede the JSDoc.
  const declStarts = /^(export|function|class|const|let|var|async\s+function)\b/;

  for (let i = 0; i < sourceLines.length; i += 1) {
    const trimmed = sourceLines[i].trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    // An `import` (or `import type`) statement is allowed to precede the
    // JSDoc block; keep scanning.
    if (trimmed.startsWith("import ") || trimmed.startsWith("import\t")) continue;

    // Found `/**` — try to read it as a JSDoc block.
    if (trimmed.startsWith("/**")) {
      const startLine = i + 1; // 1-based

      // Single-line `/** ... */` form.
      if (trimmed.includes("*/") && trimmed.indexOf("*/") > trimmed.indexOf("/**")) {
        const inner = trimmed.slice(3, trimmed.lastIndexOf("*/"));
        return {
          startLine,
          endLine: startLine,
          lines: [stripLeadingAsterisk(inner)],
        };
      }

      // Multi-line block — collect lines until we hit `*/`.
      const blockLines: string[] = [];
      blockLines.push(stripLeadingAsterisk(trimmed.slice(3)));

      for (let j = i + 1; j < sourceLines.length; j += 1) {
        const raw = sourceLines[j];
        const closingIdx = raw.indexOf("*/");
        if (closingIdx >= 0) {
          blockLines.push(stripLeadingAsterisk(raw.slice(0, closingIdx)));
          return {
            startLine,
            endLine: j + 1,
            lines: blockLines,
          };
        }
        blockLines.push(stripLeadingAsterisk(raw));
      }

      // Unterminated JSDoc block — treat as no block found.
      return null;
    }

    // The first non-skipped, non-JSDoc line is a declaration body —
    // there's no JSDoc header to find.
    if (declStarts.test(trimmed)) {
      return null;
    }

    // Anything else (e.g. a plain `/* ... */` block comment, or some other
    // expression) — also bail out. The JSDoc must precede any other code.
    return null;
  }

  return null;
}

/**
 * Strip the leading JSDoc `*` (with surrounding whitespace) from a single
 * line of the block body. Preserves the rest of the line verbatim so that
 * tag values that span multiple lines keep their relative indentation.
 */
function stripLeadingAsterisk(line: string): string {
  // Match optional leading whitespace, an optional `*`, and one space.
  // We do NOT eat trailing whitespace — the caller can trim as needed.
  return line.replace(/^\s*\*\s?/, "");
}

/**
 * Parses the JSDoc block body — already located + asterisk-stripped — into a
 * structured tag record. Emits per-tag JSON-parse errors for the JSON-ish
 * tags. Does NOT decide whether required tags are missing — the caller layers
 * that on top of the returned record.
 *
 * `blockStartLine` is the 1-based source line of the opening `/**` so we can
 * translate block-internal line offsets back to file lines.
 */
function tokenizeTags(
  blockLines: string[],
  blockStartLine: number,
): {
  block: ParsedJsDocBlock;
  errors: JsDocParseError[];
} {
  const errors: JsDocParseError[] = [];
  const block: ParsedJsDocBlock = { hasMarker: false };

  // Walk the block top-to-bottom. When a line starts with a recognized tag,
  // gather the value until the next recognized tag or end-of-block. Lines
  // that don't start with a recognized tag are treated as continuations of
  // the previous tag's value.
  let i = 0;
  while (i < blockLines.length) {
    const line = blockLines[i];
    const tagMatch = line.match(/^\s*(@[a-zA-Z][a-zA-Z0-9_-]*)\b\s*(.*)$/);
    if (!tagMatch) {
      i += 1;
      continue;
    }

    const tag = tagMatch[1];
    const rest = tagMatch[2];
    const tagFileLine = blockStartLine + i;

    if (!isRecognizedTag(tag)) {
      // Unrecognized tag — silently skip (spec doesn't ask us to reject).
      i += 1;
      continue;
    }

    // Gather the value: this line's `rest` + subsequent lines until the
    // next recognized tag OR the end of block.
    const valueLines: string[] = [rest];
    let j = i + 1;
    while (j < blockLines.length) {
      const nextLine = blockLines[j];
      const nextTagMatch = nextLine.match(/^\s*(@[a-zA-Z][a-zA-Z0-9_-]*)\b/);
      if (nextTagMatch && isRecognizedTag(nextTagMatch[1])) {
        break;
      }
      valueLines.push(nextLine);
      j += 1;
    }

    const rawValue = valueLines.join("\n").trim();

    applyTag(block, errors, tag, rawValue, valueLines, tagFileLine);

    i = j;
  }

  return { block, errors };
}

function isRecognizedTag(tag: string): tag is (typeof RECOGNIZED_TAGS)[number] {
  return (RECOGNIZED_TAGS as ReadonlyArray<string>).includes(tag);
}

/**
 * Apply a single recognized tag's raw value into the structured block.
 *
 * Emits JSON-ish parse errors for the four JSON-value tags with line/column
 * computed relative to the file. Emits a parse error for non-numeric values
 * of `@timeoutMs` / `@maxMemoryMB`. Emits a parse error for non-boolean
 * values of `@deterministic`.
 */
function applyTag(
  block: ParsedJsDocBlock,
  errors: JsDocParseError[],
  tag: (typeof RECOGNIZED_TAGS)[number],
  rawValue: string,
  valueLines: string[],
  tagFileLine: number,
): void {
  switch (tag) {
    case "@workflow-node":
      block.hasMarker = true;
      return;
    case "@name":
      block.name = { value: rawValue, line: tagFileLine };
      return;
    case "@description":
      block.description = { value: rawValue, line: tagFileLine };
      return;
    case "@category":
      block.category = { value: rawValue, line: tagFileLine };
      return;
    case "@deterministic": {
      const parsed = parseBooleanTagValue(rawValue);
      if (parsed === null) {
        errors.push({
          stage: "jsdoc-parse",
          message: `Invalid @deterministic value: expected "true" or "false", got "${rawValue}"`,
          line: tagFileLine,
          tag: "@deterministic",
        });
        return;
      }
      block.deterministic = { value: parsed, line: tagFileLine };
      return;
    }
    case "@timeoutMs":
    case "@maxMemoryMB": {
      const num = parseNumberTagValue(rawValue);
      if (num === null) {
        errors.push({
          stage: "jsdoc-parse",
          message: `Invalid ${tag} value: expected a number, got "${rawValue}"`,
          line: tagFileLine,
          tag,
        });
        return;
      }
      if (tag === "@timeoutMs") {
        block.timeoutMs = { value: num, line: tagFileLine };
      } else {
        block.maxMemoryMB = { value: num, line: tagFileLine };
      }
      return;
    }
    case "@inputs":
    case "@outputs":
    case "@parameters":
    case "@allowNet": {
      const result = parseJsonishTagValue(rawValue, valueLines, tagFileLine, tag);
      if (result.kind === "error") {
        errors.push(result.error);
        return;
      }
      const slot: JsDocTagValue<unknown> = {
        value: result.value,
        line: tagFileLine,
      };
      if (tag === "@inputs") block.inputs = slot;
      else if (tag === "@outputs") block.outputs = slot;
      else if (tag === "@parameters") block.parameters = slot;
      else block.allowNet = slot;
      return;
    }
  }
}

function parseBooleanTagValue(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseNumberTagValue(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return null;
  // Reject NaN, Infinity etc. — only finite numbers count.
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Parse a JSON-ish value via JSON5 (tolerates trailing commas, unquoted keys,
 * single-quoted strings, comments). On failure, translates the JSON5 parse
 * error's line/column (which is relative to the rawValue string) back into
 * file line/column coordinates.
 */
function parseJsonishTagValue(
  rawValue: string,
  valueLines: string[],
  tagFileLine: number,
  tag: "@inputs" | "@outputs" | "@parameters" | "@allowNet",
):
  | { kind: "ok"; value: unknown }
  | { kind: "error"; error: JsDocParseError } {
  if (rawValue === "") {
    return {
      kind: "error",
      error: {
        stage: "jsdoc-parse",
        message: `Invalid ${tag} value: expected a JSON object or array, got empty value`,
        line: tagFileLine,
        tag,
      },
    };
  }

  try {
    const parsed: unknown = JSON5.parse(rawValue);
    return { kind: "ok", value: parsed };
  } catch (err) {
    const { line, column, message } = extractJson5ErrorPosition(
      err,
      valueLines,
      tagFileLine,
      tag,
    );
    return {
      kind: "error",
      error: {
        stage: "jsdoc-parse",
        message,
        line,
        column,
        tag,
      },
    };
  }
}

/**
 * Pull line/column out of a JSON5 SyntaxError and translate it into file
 * coordinates. JSON5 attaches `lineNumber` (1-based) and `columnNumber`
 * (1-based) properties to its thrown errors; we fall back to the tag's
 * own line when those are missing.
 */
function extractJson5ErrorPosition(
  err: unknown,
  valueLines: string[],
  tagFileLine: number,
  tag: string,
): { line: number; column?: number; message: string } {
  const tagPrefixLines = valueLines.length;

  let parseLine: number | undefined;
  let parseColumn: number | undefined;
  let parseMessage = `Failed to parse ${tag} value`;

  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.lineNumber === "number") parseLine = e.lineNumber;
    if (typeof e.columnNumber === "number") parseColumn = e.columnNumber;
    if (typeof e.message === "string") parseMessage = e.message;
  }

  // JSON5's line numbers are within `rawValue`. The rawValue's first line is
  // the same source line as the tag itself, so file_line = tagFileLine +
  // (parseLine - 1).
  let line = tagFileLine;
  if (typeof parseLine === "number" && parseLine >= 1) {
    line = tagFileLine + (parseLine - 1);
  } else {
    // No explicit line — pin to last line of the value as best-effort.
    line = tagFileLine + Math.max(0, tagPrefixLines - 1);
  }

  return {
    line,
    column: parseColumn,
    message: `Invalid ${tag} value: ${parseMessage}`,
  };
}

/**
 * Internal helper exposed for US-159's consumption. Locates the top-of-file
 * JSDoc block + tokenizes it into the per-tag record.
 *
 * Returns `block: null` when the file has no top-of-file JSDoc block at all.
 * In that case the only emitted error is the missing-marker error from
 * `parseDynamicNodeSignature`'s wrapper.
 */
export function parseJsDocBlock(script: string): {
  block: ParsedJsDocBlock | null;
  errors: JsDocParseError[];
} {
  const located = findTopOfFileJsDocBlock(script);
  if (located === null) {
    return { block: null, errors: [] };
  }

  const { block, errors } = tokenizeTags(located.lines, located.startLine);
  return { block, errors };
}

/**
 * Parse a dynamic-node script's JSDoc signature header.
 *
 * Two stages run in order, short-circuiting at the first failing stage:
 *   1. `jsdoc-parse` (US-158) — locate + tokenize the JSDoc header. Failures
 *      include missing `@workflow-node` marker, missing required tags, and
 *      malformed JSON-ish values for `@inputs` / `@outputs` / `@parameters`
 *      / `@allowNet`.
 *   2. `signature-semantics` (US-159) — slug regex check against
 *      `/^[a-z][a-z0-9-]*$/` (max 64 chars), every declared input + output
 *      `kind` cross-checked against the live `ArtifactKind` registry,
 *      `@parameters` shape coerced to JSON Schema 7, defaults applied, caps
 *      silently clamped. On success: assembles + returns a derived
 *      `ActivityCatalogEntry` per DYNAMIC_NODES_DESIGN.md §2.2.
 *
 * On any stage failure: `entry` is `null` and `errors` is non-empty.
 */
export function parseDynamicNodeSignature(script: string): {
  entry: ActivityCatalogEntry | null;
  errors: ParseError[];
} {
  // Stage 1: JSDoc parse.
  const jsdocResult = runJsDocParseStage(script);
  if (jsdocResult.errors.length > 0 || jsdocResult.block === null) {
    return { entry: null, errors: jsdocResult.errors };
  }

  // Stage 2: signature semantics.
  const semanticsResult = runSignatureSemanticsStage(jsdocResult.block);
  if (semanticsResult.errors.length > 0) {
    return { entry: null, errors: semanticsResult.errors };
  }

  return { entry: semanticsResult.entry, errors: [] };
}

/**
 * Runs the `jsdoc-parse` stage. Returns the parsed block + ALL jsdoc-parse
 * errors (block-level missing-marker, per-tag JSON/number/boolean parse
 * errors, and per-required-tag missing errors).
 *
 * On any error, the caller should NOT proceed to the semantics stage.
 */
function runJsDocParseStage(script: string): {
  block: ParsedJsDocBlock | null;
  errors: JsDocParseError[];
} {
  const { block, errors } = parseJsDocBlock(script);

  // Case 1: no top-of-file JSDoc block at all → the marker is missing.
  if (block === null) {
    return {
      block: null,
      errors: [
        {
          stage: "jsdoc-parse",
          message: "Missing @workflow-node marker",
          line: 1,
        },
      ],
    };
  }

  // Case 2: JSDoc block found, but no @workflow-node marker inside it.
  if (!block.hasMarker) {
    return {
      block: null,
      errors: [
        {
          stage: "jsdoc-parse",
          message: "Missing @workflow-node marker",
          line: 1,
        },
      ],
    };
  }

  // Marker present — emit one error per missing required tag.
  const missingTagErrors: JsDocParseError[] = [];
  for (const tag of REQUIRED_TAGS) {
    if (!isTagPresent(block, tag)) {
      missingTagErrors.push({
        stage: "jsdoc-parse",
        message: `Missing required tag ${tag}`,
        tag,
      });
    }
  }

  return {
    block,
    errors: [...errors, ...missingTagErrors],
  };
}

function isTagPresent(
  block: ParsedJsDocBlock,
  tag: "@name" | "@description" | "@inputs" | "@outputs",
): boolean {
  switch (tag) {
    case "@name":
      return block.name !== undefined && block.name.value !== "";
    case "@description":
      return block.description !== undefined && block.description.value !== "";
    case "@inputs":
      return block.inputs !== undefined;
    case "@outputs":
      return block.outputs !== undefined;
  }
}

// =============================================================================
// Signature-semantics stage (US-159).
// =============================================================================

/** Phase 6.0 hardcoded ceiling for `@timeoutMs` (milliseconds). */
const TIMEOUT_MS_CAP = 60_000;
/** Phase 6.0 hardcoded default for `@timeoutMs`. */
const TIMEOUT_MS_DEFAULT = 60_000;
/** Phase 6.0 hardcoded ceiling for `@maxMemoryMB`. */
const MAX_MEMORY_MB_CAP = 256;
/** Phase 6.0 hardcoded default for `@maxMemoryMB`. */
const MAX_MEMORY_MB_DEFAULT = 256;
/** Default for `@category` when omitted. */
const CATEGORY_DEFAULT = "Custom";
/** Default for `@deterministic` when omitted. */
const DETERMINISTIC_DEFAULT = false;
/** Slug must match this regex, max 64 chars (`@name`). */
const SLUG_REGEX = /^[a-z][a-z0-9-]*$/;
/** Max slug length. */
const SLUG_MAX_LENGTH = 64;
/** Param `type` values recognized by `@parameters`. */
const RECOGNIZED_PARAM_TYPES = new Set<string>([
  "string",
  "number",
  "boolean",
  "enum",
]);

/**
 * Runs the `signature-semantics` stage against an already-parsed JSDoc block.
 * Either returns a fully-assembled `ActivityCatalogEntry` (success) or a
 * non-empty list of `signature-semantics` errors.
 *
 * Order of checks:
 *   1. Slug (`@name`) regex + length.
 *   2. `@inputs` + `@outputs` shape (must be objects) + per-port kind
 *      registry lookup.
 *   3. `@parameters` shape (must be an object if present) + per-property
 *      coercion to a JSON Schema 7 fragment.
 *   4. Defaults application + numeric caps (silent clamp on `@timeoutMs` /
 *      `@maxMemoryMB`).
 *   5. Derived `ActivityCatalogEntry` assembly.
 *
 * Errors from steps 1–3 accumulate; the entry is only assembled when zero
 * errors emerge.
 */
function runSignatureSemanticsStage(block: ParsedJsDocBlock): {
  entry: ActivityCatalogEntry | null;
  errors: SignatureSemanticsError[];
} {
  const errors: SignatureSemanticsError[] = [];

  // The jsdoc-parse stage guarantees `@name`, `@description`, `@inputs`,
  // `@outputs` are all present (otherwise we short-circuit). Reading them
  // here is safe.
  const slug = block.name!.value;
  const description = block.description!.value;

  // --- Step 1: slug regex + length.
  if (!isValidSlug(slug)) {
    errors.push({
      stage: "signature-semantics",
      message: "@name must match /^[a-z][a-z0-9-]*$/ max 64 chars",
      tag: "@name",
      line: block.name!.line,
    });
  }

  // --- Step 2: @inputs / @outputs shape + per-port kind validation.
  const inputs = validatePortMap(
    block.inputs!.value,
    "@inputs",
    block.inputs!.line,
    errors,
  );
  const outputs = validatePortMap(
    block.outputs!.value,
    "@outputs",
    block.outputs!.line,
    errors,
  );

  // --- Step 3: @parameters → JSON Schema 7.
  const paramsSchema = buildParamsSchema(
    block.parameters?.value,
    block.parameters?.line,
    errors,
  );

  // If any of the above produced errors, bail out before assembling the entry.
  if (errors.length > 0) {
    return { entry: null, errors };
  }

  // --- Step 4: defaults + caps.
  const category = block.category?.value ?? CATEGORY_DEFAULT;
  const deterministic = block.deterministic?.value ?? DETERMINISTIC_DEFAULT;
  const allowNet = extractAllowNet(block.allowNet?.value);
  const timeoutMs = block.timeoutMs?.value !== undefined
    ? Math.min(block.timeoutMs.value, TIMEOUT_MS_CAP)
    : TIMEOUT_MS_DEFAULT;
  const maxMemoryMB = block.maxMemoryMB?.value !== undefined
    ? Math.min(block.maxMemoryMB.value, MAX_MEMORY_MB_CAP)
    : MAX_MEMORY_MB_DEFAULT;

  // --- Step 5: assemble the derived ActivityCatalogEntry.
  // US-161 reconciled the dynamic-entry shape with the existing
  // `ActivityCatalogEntry` type: dynamic entries use the canonical
  // `activityType` field (prefixed `dyn.`) and `paramsSchema` (JSON
  // Schema 7) instead of the Zod `parametersSchema`. `displayName` is
  // omitted (the type accepts it as optional). `timeoutMs` /
  // `maxMemoryMB` ride alongside via the catalog-merge layer (US-173)
  // — they're not part of the catalog-entry type itself but the dynamic
  // assembly surfaces them under the matching property names.
  const entry: ActivityCatalogEntry & {
    timeoutMs: number;
    maxMemoryMB: number;
  } = {
    activityType: `dyn.${slug}`,
    category,
    description,
    iconHint: "code",
    colorHint: "dyn",
    nonCacheable: !deterministic,
    paramsSchema,
    inputs,
    outputs,
    dynamicNodeSlug: slug,
    dynamicNodeVersion: 0,
    allowNet,
    timeoutMs,
    maxMemoryMB,
  };

  return {
    entry,
    errors: [],
  };
}

/** True iff `slug` matches `/^[a-z][a-z0-9-]*$/` and is ≤ 64 chars. */
function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > SLUG_MAX_LENGTH) return false;
  return SLUG_REGEX.test(slug);
}

/**
 * Validates an `@inputs` / `@outputs` JSON value. The value MUST be a plain
 * object whose keys are port names and whose values are `{ kind, ... }`
 * objects. On shape failure: emits one error and returns `[]`. On per-port
 * kind failure: emits one error per offending port and skips that port from
 * the returned list (the entry is still NOT assembled if any errors fired).
 */
function validatePortMap(
  raw: unknown,
  tag: "@inputs" | "@outputs",
  line: number,
  errors: SignatureSemanticsError[],
): PortDescriptor[] {
  if (!isPlainObject(raw)) {
    errors.push({
      stage: "signature-semantics",
      message: `${tag} must be an object mapping port names to { kind, ... }`,
      tag,
      line,
    });
    return [];
  }

  const result: PortDescriptor[] = [];
  for (const [portName, portRawValue] of Object.entries(raw)) {
    if (!isPlainObject(portRawValue)) {
      errors.push({
        stage: "signature-semantics",
        message: `${tag}.${portName} must be an object with at least a "kind" property`,
        tag,
        line,
      });
      continue;
    }

    const portShape = portRawValue as Record<string, unknown>;
    const kind = portShape.kind;
    if (typeof kind !== "string" || kind.length === 0) {
      errors.push({
        stage: "signature-semantics",
        message: `${tag}.${portName} is missing a string "kind"`,
        tag,
        line,
      });
      continue;
    }

    if (!isKnownKind(kind)) {
      errors.push({
        stage: "signature-semantics",
        message: `Unknown kind: ${kind}`,
        tag,
        line,
        unknownKind: kind,
      });
      continue;
    }

    const descriptor: PortDescriptor = {
      name: portName,
      label: portName,
      kind: kind as KindRef,
    };
    if (typeof portShape.required === "boolean") {
      descriptor.required = portShape.required;
    }
    if (typeof portShape.description === "string") {
      descriptor.description = portShape.description;
    }
    result.push(descriptor);
  }

  return result;
}

/**
 * Splits a kind string into its element + array flag, then checks the
 * element against the live `ArtifactKind` registry. `"Segment[]"` → checks
 * `"Segment"`. The bare element form (`"Segment"`) is checked directly.
 *
 * Mirrors the array-stripping logic used by Phase 3's `isAssignable`
 * (`packages/graph-workflow/src/types/subtype-check.ts`) — we don't reuse
 * `isAssignable` directly because it treats unknown kinds as the wildcard
 * `Artifact` (which is correct for assignability but wrong for a registry
 * existence check).
 */
function isKnownKind(kind: string): boolean {
  const element = kind.endsWith("[]") ? kind.slice(0, -2) : kind;
  if (element.length === 0) return false;
  return getArtifactKindMeta(element) !== undefined;
}

/**
 * Coerces the raw `@parameters` value into a JSON Schema 7 object. Empty
 * (omitted) `@parameters` → an empty-object schema. Each declared param
 * becomes one entry in `properties`. All declared params are OPTIONAL in
 * Phase 6.0 — `required: []` is always returned (a future story can add a
 * `required: true` field on the param declaration).
 *
 * Recognized param `type` values: `"string"`, `"number"`, `"boolean"`,
 * `"enum"`. Anything else produces a semantics error.
 *
 * Recognized per-param keys: `type` (required), `default`, `min` →
 * `minimum`, `max` → `maximum`, `enum` (array of strings, used when
 * `type === "enum"`), `description`. Unknown keys are silently dropped
 * (forward-compatibility for future param flags).
 */
function buildParamsSchema(
  raw: unknown,
  line: number | undefined,
  errors: SignatureSemanticsError[],
): Record<string, unknown> {
  const emptySchema: Record<string, unknown> = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  };

  if (raw === undefined) return emptySchema;

  if (!isPlainObject(raw)) {
    errors.push({
      stage: "signature-semantics",
      message: "@parameters must be an object mapping param names to { type, ... }",
      tag: "@parameters",
      line,
    });
    return emptySchema;
  }

  const properties: Record<string, Record<string, unknown>> = {};

  for (const [paramName, paramRawValue] of Object.entries(raw)) {
    if (!isPlainObject(paramRawValue)) {
      errors.push({
        stage: "signature-semantics",
        message: `@parameters.${paramName} must be an object with at least a "type" property`,
        tag: "@parameters",
        line,
      });
      continue;
    }

    const paramShape = paramRawValue as Record<string, unknown>;
    const declaredType = paramShape.type;
    if (typeof declaredType !== "string" || !RECOGNIZED_PARAM_TYPES.has(declaredType)) {
      errors.push({
        stage: "signature-semantics",
        message: `@parameters.${paramName}.type "${String(declaredType)}" is not supported (expected one of: string, number, boolean, enum)`,
        tag: "@parameters",
        line,
      });
      continue;
    }

    const propertySchema: Record<string, unknown> = {};

    // `enum` type maps to JSON Schema's `enum` constraint without a `type`
    // field of its own (the values' types are heterogeneous in principle;
    // for Phase 6.0 we accept arrays of strings only). Other types map
    // directly through.
    if (declaredType === "enum") {
      if (!Array.isArray(paramShape.enum)) {
        errors.push({
          stage: "signature-semantics",
          message: `@parameters.${paramName}.type is "enum" but no "enum" array was provided`,
          tag: "@parameters",
          line,
        });
        continue;
      }
      const enumValues = paramShape.enum;
      if (!enumValues.every((v): v is string => typeof v === "string")) {
        errors.push({
          stage: "signature-semantics",
          message: `@parameters.${paramName}.enum must be an array of strings`,
          tag: "@parameters",
          line,
        });
        continue;
      }
      propertySchema.enum = enumValues;
    } else {
      propertySchema.type = declaredType;
      // Numeric constraints only apply to numeric types; silently dropped
      // when irrelevant. `enum` keys ignored for non-enum types.
      if (declaredType === "number" && typeof paramShape.min === "number") {
        propertySchema.minimum = paramShape.min;
      }
      if (declaredType === "number" && typeof paramShape.max === "number") {
        propertySchema.maximum = paramShape.max;
      }
    }

    if (paramShape.default !== undefined) {
      propertySchema.default = paramShape.default;
    }
    if (typeof paramShape.description === "string") {
      propertySchema.description = paramShape.description;
    }

    properties[paramName] = propertySchema;
  }

  return {
    type: "object",
    properties,
    required: [],
    additionalProperties: false,
  };
}

/**
 * Coerces `@allowNet` JSON value to `string[]`. Missing → `[]`. Non-array
 * values produce a semantics error (caught earlier by JSDoc-parse if the
 * value isn't JSON-parseable, but a JSON object slipping in here still
 * needs rejecting).
 *
 * Per the requirements doc L18 the default is `[]`.
 */
function extractAllowNet(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (Array.isArray(raw) && raw.every((v): v is string => typeof v === "string")) {
    return raw;
  }
  // Defensive fallback — `@allowNet` must be a string[]; non-conforming
  // values collapse to empty so the assembled entry stays well-typed.
  // The jsdoc-parse stage already rejects malformed JSON; only well-typed
  // but wrong-shaped values reach here.
  return [];
}

/** True iff `value` is a plain object (`{}`), not an array, not null. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

