/**
 * `parseDynamicNodeSignature` — Phase 6 dynamic-node JSDoc-parse stage.
 *
 * Pure function (no I/O, no side effects) that scans a TypeScript script for
 * its top-of-file JSDoc header, extracts the recognized `@workflow-node` tag
 * set, and returns either a structured per-tag record or a list of
 * `jsdoc-parse` `ParseError`s.
 *
 * This module covers ONLY the JSDoc-parse stage (US-158). Semantics
 * validation (slug regex, kind-registry cross-check, params shape coercion)
 * + final `ActivityCatalogEntry` assembly land in US-159.
 *
 * Authoritative spec:
 *   - feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md
 *     §3.3 L17 (shared-package contract) + L18 (recognized tag list + defaults).
 *   - docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md §2 (full JSDoc example
 *     + tag table).
 *
 * Runs CLIENT-SIDE as well as in Node — no node-only modules. The shared
 * package is bundled into the frontend Vite build.
 */

import JSON5 from "json5";

import type { ActivityCatalogEntry } from "../catalog/types";
import type { JsDocParseError, ParseError } from "./types";

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
 * US-158 covers the `jsdoc-parse` stage ONLY. `entry` is always `null` in
 * this story — US-159 wires the semantics + entry-assembly step that
 * populates a real `ActivityCatalogEntry`.
 *
 * Errors emitted at this stage all have `stage: "jsdoc-parse"`.
 */
export function parseDynamicNodeSignature(script: string): {
  entry: ActivityCatalogEntry | null;
  errors: ParseError[];
} {
  const { block, errors } = parseJsDocBlock(script);

  // Case 1: no top-of-file JSDoc block at all → the marker is missing.
  if (block === null) {
    return {
      entry: null,
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
      entry: null,
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
  // Per-tag JSON / number / boolean parse errors from `tokenizeTags` ride
  // alongside; both surface in the same `errors[]` array.
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
    entry: null,
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
