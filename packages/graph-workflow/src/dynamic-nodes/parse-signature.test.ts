/**
 * Tests for `parseDynamicNodeSignature` — Phase 6 dynamic-node parser.
 *
 * Covers the JSDoc-parse stage (US-158) AND the signature-semantics +
 * entry-assembly stage (US-159).
 *
 * Coverage maps to the six acceptance scenarios in
 * `US-158-parse-signature-jsdoc-stage.md`:
 *
 *   1. The new file exports a pure `parseDynamicNodeSignature` function.
 *   2. Recognizes the `@workflow-node` marker tag (and emits the
 *      missing-marker error when absent).
 *   3. Extracts every recognized tag with line numbers; missing required
 *      tags surface one `ParseError` each.
 *   4. JSON-ish values parse with JSON5-equivalent tolerance; malformed
 *      bodies surface line/column-anchored errors.
 *   5. Unit tests cover every error path + happy path.
 *   6. Re-exported from the package barrel (verified by the import path
 *      below and by `npm run build` succeeding).
 *
 * AND the six acceptance scenarios in
 * `US-159-signature-semantics-and-entry-assembly.md`:
 *
 *   1. Slug validation against `/^[a-z][a-z0-9-]*$/` max 64 chars.
 *   2. Kind registry check for every input + output port (incl. arrays).
 *   3. `@parameters` shape coerces to JSON Schema 7.
 *   4. Caps + defaults applied to numeric tags (silent clamp).
 *   5. Derived `ActivityCatalogEntry` assembled on success.
 *   6. Integration: jsdoc-parse failure short-circuits before semantics.
 */

import {
  parseDynamicNodeSignature,
  parseJsDocBlock,
} from "./parse-signature";
import type { JsDocParseError, SignatureSemanticsError } from "./types";

// Re-import via the package barrel so the test simultaneously asserts the
// barrel re-export (Scenario 6).
import {
  parseDynamicNodeSignature as parseFromBarrel,
  parseJsDocBlock as parseBlockFromBarrel,
} from "../index";

/**
 * Test-only view of the dynamic-node `ActivityCatalogEntry` that exposes the
 * Phase-6 extended fields the parser emits. The runtime cast on the parser's
 * output (US-159 — see `parse-signature.ts`) hides these from the
 * `ActivityCatalogEntry` type until US-161 fully reconciles the type.
 */
type DynamicNodeEntryView = {
  type: string;
  category: string;
  description: string;
  iconHint: string;
  colorHint: string;
  nonCacheable: boolean;
  paramsSchema: Record<string, unknown>;
  inputs: Array<{
    name: string;
    label: string;
    kind: string;
    required?: boolean;
    description?: string;
  }>;
  outputs: Array<{
    name: string;
    label: string;
    kind: string;
    required?: boolean;
    description?: string;
  }>;
  dynamicNodeSlug: string;
  dynamicNodeVersion: number;
  allowNet: string[];
  timeoutMs: number;
  maxMemoryMB: number;
};

function asDyn(
  entry: ReturnType<typeof parseDynamicNodeSignature>["entry"],
): DynamicNodeEntryView {
  if (entry === null) throw new Error("expected entry, got null");
  return entry as unknown as DynamicNodeEntryView;
}

describe("parseDynamicNodeSignature — Scenario 1: function shape + purity", () => {
  it("exports parseDynamicNodeSignature returning { entry, errors }", () => {
    const result = parseDynamicNodeSignature("");
    expect(result).toHaveProperty("entry");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("is pure — same input twice yields equal output", () => {
    const script = "// no jsdoc here";
    const a = parseDynamicNodeSignature(script);
    const b = parseDynamicNodeSignature(script);
    expect(a).toEqual(b);
  });

  it("returns entry: null when the script has any error", () => {
    // No JSDoc block → missing-marker error → entry is null.
    const invalidScript = `export default async function dynamicNode() {}`;
    expect(parseDynamicNodeSignature(invalidScript).entry).toBeNull();
  });

  it("returns a populated ActivityCatalogEntry on a fully valid script (US-159)", () => {
    const validScript = `
/**
 * @workflow-node
 * @name my-node
 * @description Does a thing.
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    expect(parseDynamicNodeSignature(validScript).entry).not.toBeNull();
  });
});

describe("parseDynamicNodeSignature — Scenario 2: @workflow-node marker", () => {
  it("returns the missing-marker error when no JSDoc block is present", () => {
    const script = `export default async function dynamicNode() {}`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing @workflow-node marker",
        line: 1,
      },
    ]);
  });

  it("returns the missing-marker error when JSDoc exists but lacks @workflow-node", () => {
    const script = `
/**
 * @name my-node
 * @description Does a thing.
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing @workflow-node marker",
        line: 1,
      },
    ]);
  });

  it("treats `// @workflow-node` line comments as NOT a JSDoc marker (only /** ... */ counts)", () => {
    const script = `
// @workflow-node
// @name my-node
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors[0]).toEqual({
      stage: "jsdoc-parse",
      message: "Missing @workflow-node marker",
      line: 1,
    });
  });

  it("treats `/* not jsdoc */` regular block comments as NOT a JSDoc marker", () => {
    const script = `
/*
 * @workflow-node
 * @name my-node
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors[0]).toEqual({
      stage: "jsdoc-parse",
      message: "Missing @workflow-node marker",
      line: 1,
    });
  });

  it("proceeds to extract subsequent tags when @workflow-node is present", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description Does a thing.
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
  });
});

describe("parseDynamicNodeSignature — Scenario 3: tag extraction + line tracking", () => {
  const fullScript = `import type { Document, OcrTable } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name extract-tables-via-public-pdf
 * @description Extracts tables from a publicly-hosted PDF.
 * @category Custom
 * @deterministic false
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { tables: { kind: "OcrTable[]" } }
 * @parameters { minConfidence: { type: "number", default: 0.5 } }
 * @allowNet ["tabula.example.com"]
 * @timeoutMs 30000
 * @maxMemoryMB 128
 */
export default async function dynamicNode() {}
`;

  it("extracts every recognized tag onto the internal record", () => {
    const { block } = parseJsDocBlock(fullScript);
    expect(block).not.toBeNull();
    expect(block!.hasMarker).toBe(true);
    expect(block!.name?.value).toBe("extract-tables-via-public-pdf");
    expect(block!.description?.value).toBe(
      "Extracts tables from a publicly-hosted PDF.",
    );
    expect(block!.category?.value).toBe("Custom");
    expect(block!.deterministic?.value).toBe(false);
    expect(block!.inputs?.value).toEqual({
      document: { kind: "Document", required: true },
    });
    expect(block!.outputs?.value).toEqual({
      tables: { kind: "OcrTable[]" },
    });
    expect(block!.parameters?.value).toEqual({
      minConfidence: { type: "number", default: 0.5 },
    });
    expect(block!.allowNet?.value).toEqual(["tabula.example.com"]);
    expect(block!.timeoutMs?.value).toBe(30000);
    expect(block!.maxMemoryMB?.value).toBe(128);
  });

  it("records the file line of each tag's marker", () => {
    const { block } = parseJsDocBlock(fullScript);
    expect(block).not.toBeNull();
    // The opening `/**` is on line 3 (import on line 1, blank on line 2,
    // `/**` on line 3). `@workflow-node` is on line 4, `@name` on line 5, …
    expect(block!.name?.line).toBe(5);
    expect(block!.description?.line).toBe(6);
    expect(block!.category?.line).toBe(7);
    expect(block!.deterministic?.line).toBe(8);
    expect(block!.inputs?.line).toBe(9);
    expect(block!.outputs?.line).toBe(10);
    expect(block!.parameters?.line).toBe(11);
    expect(block!.allowNet?.line).toBe(12);
    expect(block!.timeoutMs?.line).toBe(13);
    expect(block!.maxMemoryMB?.line).toBe(14);
  });

  it("emits a missing-tag error per missing required tag (@name)", () => {
    const script = `
/**
 * @workflow-node
 * @description has description
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing required tag @name",
        tag: "@name",
      },
    ]);
  });

  it("emits a missing-tag error per missing required tag (@description)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing required tag @description",
        tag: "@description",
      },
    ]);
  });

  it("emits a missing-tag error per missing required tag (@inputs)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing required tag @inputs",
        tag: "@inputs",
      },
    ]);
  });

  it("emits a missing-tag error per missing required tag (@outputs)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing required tag @outputs",
        tag: "@outputs",
      },
    ]);
  });

  it("emits ONE error per missing required tag when multiple are missing", () => {
    const script = `
/**
 * @workflow-node
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toHaveLength(4);
    expect(errors.map((e) => e.stage)).toEqual([
      "jsdoc-parse",
      "jsdoc-parse",
      "jsdoc-parse",
      "jsdoc-parse",
    ]);
    expect(errors.map((e) => "tag" in e ? e.tag : undefined)).toEqual([
      "@name",
      "@description",
      "@inputs",
      "@outputs",
    ]);
  });
});

describe("parseDynamicNodeSignature — Scenario 4: JSON5 tolerance + error positioning", () => {
  it("parses JSON5-style @inputs with unquoted keys + trailing commas", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { document: { kind: "Document", required: true, } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { block } = parseJsDocBlock(script);
    expect(block!.inputs?.value).toEqual({
      document: { kind: "Document", required: true },
    });
  });

  it("emits a structured error for malformed @inputs (unterminated string)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { document: { kind: "Document }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const inputsErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@inputs",
    );
    expect(inputsErr).toBeDefined();
    expect(inputsErr).toMatchObject({
      stage: "jsdoc-parse",
      tag: "@inputs",
    });
    expect(typeof inputsErr!.message).toBe("string");
    expect(inputsErr!.message.length).toBeGreaterThan(0);
    // The malformed @inputs is on line 6 of the source file.
    expect(inputsErr!.line).toBe(6);
  });

  it("emits a structured error for malformed @inputs (missing closing brace)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { document: { kind: "Document" }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const inputsErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@inputs",
    );
    expect(inputsErr).toBeDefined();
    expect(inputsErr!.stage).toBe("jsdoc-parse");
    expect(inputsErr!.line).toBeGreaterThanOrEqual(6);
  });

  it("emits a structured error for malformed @outputs", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const outputsErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@outputs",
    );
    expect(outputsErr).toBeDefined();
    expect(outputsErr!.stage).toBe("jsdoc-parse");
    expect(outputsErr!.tag).toBe("@outputs");
  });

  it("emits an error for an empty @inputs body", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const inputsErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@inputs",
    );
    expect(inputsErr).toBeDefined();
    expect(inputsErr!.stage).toBe("jsdoc-parse");
    expect(inputsErr!.message).toMatch(/empty value/i);
  });

  it("emits an error for non-boolean @deterministic", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @deterministic yes
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const detErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@deterministic",
    );
    expect(detErr).toBeDefined();
    expect(detErr!.stage).toBe("jsdoc-parse");
    expect(detErr!.message).toMatch(/expected "true" or "false"/);
  });

  it("emits an error for non-numeric @timeoutMs", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @timeoutMs not-a-number
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const timeoutErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@timeoutMs",
    );
    expect(timeoutErr).toBeDefined();
    expect(timeoutErr!.stage).toBe("jsdoc-parse");
    expect(timeoutErr!.message).toMatch(/expected a number/);
  });

  it("emits an error for non-numeric @maxMemoryMB", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @maxMemoryMB lots
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    const memErr = errors.find(
      (e): e is JsDocParseError =>
        e.stage === "jsdoc-parse" && e.tag === "@maxMemoryMB",
    );
    expect(memErr).toBeDefined();
    expect(memErr!.stage).toBe("jsdoc-parse");
    expect(memErr!.message).toMatch(/expected a number/);
  });
});

describe("parseDynamicNodeSignature — Scenario 5: happy paths + edge cases", () => {
  it("happy path: valid full signature (every recognized tag) produces zero errors", () => {
    const script = `
/**
 * @workflow-node
 * @name extract-tables-via-public-pdf
 * @description Extracts tables from a publicly-hosted PDF.
 * @category Custom
 * @deterministic false
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { tables: { kind: "OcrTable[]" } }
 * @parameters { minConfidence: { type: "number", default: 0.5 } }
 * @allowNet ["tabula.example.com"]
 * @timeoutMs 30000
 * @maxMemoryMB 128
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
  });

  it("happy path: only required tags — internal record has optional tags absent (defaults applied in US-159)", () => {
    const script = `
/**
 * @workflow-node
 * @name minimal
 * @description Just the required tags.
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(entry).not.toBeNull();
    const { block } = parseJsDocBlock(script);
    // Optional tags are absent in the parsed record — defaults are the
    // semantics layer's responsibility (asserted in the US-159 default-
    // application tests below).
    expect(block!.category).toBeUndefined();
    expect(block!.deterministic).toBeUndefined();
    expect(block!.parameters).toBeUndefined();
    expect(block!.allowNet).toBeUndefined();
    expect(block!.timeoutMs).toBeUndefined();
    expect(block!.maxMemoryMB).toBeUndefined();
  });

  it("happy path: tag values spanning multiple lines are concatenated", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs {
 *   document: {
 *     kind: "Document",
 *     required: true
 *   }
 * }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { block } = parseJsDocBlock(script);
    expect(block!.inputs?.value).toEqual({
      document: { kind: "Document", required: true },
    });
  });

  it("happy path: @description trimmed of trailing whitespace", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description  Trimmed description.
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { block } = parseJsDocBlock(script);
    expect(block!.description?.value).toBe("Trimmed description.");
  });

  it("happy path: leading line comments + blank lines are allowed before the JSDoc block", () => {
    const script = `// this is a regular comment
// another regular comment

/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
  });

  it("happy path: JSDoc block following imports is accepted (canonical design example)", () => {
    const script = `import { foo } from "bar";
import type { Document } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    // The canonical example in DYNAMIC_NODES_DESIGN.md §2 shows the JSDoc
    // block following an `import type` line. The parser accepts imports
    // (only imports) before the JSDoc block.
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
  });

  it("rejects a JSDoc block preceded by a non-import code line (returns missing-marker)", () => {
    const script = `const x = 1;
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { errors } = parseDynamicNodeSignature(script);
    expect(errors[0]).toEqual({
      stage: "jsdoc-parse",
      message: "Missing @workflow-node marker",
      line: 1,
    });
  });
});

describe("parseDynamicNodeSignature — Scenario 6: barrel re-export", () => {
  it("is re-exported from the package barrel under the same name", () => {
    expect(parseFromBarrel).toBe(parseDynamicNodeSignature);
    expect(parseBlockFromBarrel).toBe(parseJsDocBlock);
  });

  it("works identically when imported via the barrel", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    expect(parseFromBarrel(script)).toEqual(parseDynamicNodeSignature(script));
  });
});

// =============================================================================
// US-159 — signature-semantics + entry-assembly stage.
// =============================================================================

describe("parseDynamicNodeSignature — US-159 Scenario 1: slug validation", () => {
  it("rejects uppercase letters in @name", () => {
    const script = `
/**
 * @workflow-node
 * @name My-Node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      stage: "signature-semantics",
      message: "@name must match /^[a-z][a-z0-9-]*$/ max 64 chars",
      tag: "@name",
      line: 4,
    });
  });

  it("rejects leading underscore in @name", () => {
    const script = `
/**
 * @workflow-node
 * @name _my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toEqual([
      {
        stage: "signature-semantics",
        message: "@name must match /^[a-z][a-z0-9-]*$/ max 64 chars",
        tag: "@name",
        line: 4,
      },
    ]);
  });

  it("rejects leading digit in @name", () => {
    const script = `
/**
 * @workflow-node
 * @name 1node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors[0]).toMatchObject({
      stage: "signature-semantics",
      tag: "@name",
    });
  });

  it("rejects @name longer than 64 chars", () => {
    const longName = "a" + "b".repeat(64); // 65 chars total
    const script = `
/**
 * @workflow-node
 * @name ${longName}
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors[0]).toMatchObject({
      stage: "signature-semantics",
      tag: "@name",
      message: "@name must match /^[a-z][a-z0-9-]*$/ max 64 chars",
    });
  });

  it("accepts a 64-char @name (boundary)", () => {
    const okName = "a" + "b".repeat(63); // exactly 64 chars
    const script = `
/**
 * @workflow-node
 * @name ${okName}
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(entry).not.toBeNull();
    expect(asDyn(entry).dynamicNodeSlug).toBe(okName);
  });

  it("accepts simple lowercase-hyphen @name", () => {
    const script = `
/**
 * @workflow-node
 * @name my-cool-node-123
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(asDyn(entry).dynamicNodeSlug).toBe("my-cool-node-123");
  });
});

describe("parseDynamicNodeSignature — US-159 Scenario 2: kind registry check", () => {
  it("registered scalar kinds (Document, Artifact) pass", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { foo: { kind: "Document" } }
 * @outputs { bar: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(entry).not.toBeNull();
  });

  it("array kinds (Segment[]) resolve via the registry", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { foo: { kind: "Document" } }
 * @outputs { bar: { kind: "Segment[]" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(entry).not.toBeNull();
    expect(asDyn(entry).outputs[0].kind).toBe("Segment[]");
  });

  it("emits Unknown kind error for unrecognized output kind", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { foo: { kind: "Document" } }
 * @outputs { bar: { kind: "NotARealKind" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    const outputErr = errors.find(
      (e): e is SignatureSemanticsError =>
        e.stage === "signature-semantics" && e.tag === "@outputs",
    );
    expect(outputErr).toBeDefined();
    expect(outputErr).toMatchObject({
      stage: "signature-semantics",
      message: "Unknown kind: NotARealKind",
      tag: "@outputs",
      unknownKind: "NotARealKind",
    });
  });

  it("emits Unknown kind error for unrecognized input kind", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { foo: { kind: "DoesNotExist" } }
 * @outputs { bar: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    const inputErr = errors.find(
      (e): e is SignatureSemanticsError =>
        e.stage === "signature-semantics" && e.tag === "@inputs",
    );
    expect(inputErr).toMatchObject({
      stage: "signature-semantics",
      message: "Unknown kind: DoesNotExist",
      tag: "@inputs",
      unknownKind: "DoesNotExist",
    });
  });

  it("emits Unknown kind error for unrecognized array kind element", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { foo: { kind: "Document" } }
 * @outputs { bar: { kind: "Unobtanium[]" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    const outputErr = errors.find(
      (e): e is SignatureSemanticsError => e.stage === "signature-semantics",
    );
    expect(outputErr).toMatchObject({
      stage: "signature-semantics",
      message: "Unknown kind: Unobtanium[]",
      tag: "@outputs",
      unknownKind: "Unobtanium[]",
    });
  });

  it("emits a shape error when @inputs is a string instead of an object", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs "foo"
 * @outputs { bar: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors[0]).toMatchObject({
      stage: "signature-semantics",
      tag: "@inputs",
      message: "@inputs must be an object mapping port names to { kind, ... }",
    });
  });

  it("emits a shape error when @inputs is an array instead of an object", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs ["foo"]
 * @outputs { bar: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    const inputErr = errors.find(
      (e): e is SignatureSemanticsError =>
        e.stage === "signature-semantics" && e.tag === "@inputs",
    );
    expect(inputErr).toBeDefined();
    expect(inputErr!.message).toBe(
      "@inputs must be an object mapping port names to { kind, ... }",
    );
  });

  it("emits errors for ALL unknown kinds across inputs + outputs", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { foo: { kind: "BogusIn" } }
 * @outputs { bar: { kind: "BogusOut" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toHaveLength(2);
    const tags = errors
      .map((e) => (e.stage === "signature-semantics" ? e.tag : undefined))
      .sort();
    expect(tags).toEqual(["@inputs", "@outputs"]);
  });
});

describe("parseDynamicNodeSignature — US-159 Scenario 3: @parameters → JSON Schema 7", () => {
  it("produces an empty-object schema when @parameters is absent", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(asDyn(entry).paramsSchema).toEqual({
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    });
  });

  it("coerces @parameters numeric param with min/max/default", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 * @parameters { minConfidence: { type: "number", default: 0.5, min: 0, max: 1 } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(asDyn(entry).paramsSchema).toEqual({
      type: "object",
      properties: {
        minConfidence: {
          type: "number",
          default: 0.5,
          minimum: 0,
          maximum: 1,
        },
      },
      required: [],
      additionalProperties: false,
    });
  });

  it("coerces @parameters string + boolean params", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 * @parameters { mode: { type: "string", default: "auto", description: "Mode" }, verbose: { type: "boolean", default: false } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    const props = (asDyn(entry).paramsSchema as { properties: Record<string, unknown> })
      .properties;
    expect(props.mode).toEqual({
      type: "string",
      default: "auto",
      description: "Mode",
    });
    expect(props.verbose).toEqual({
      type: "boolean",
      default: false,
    });
  });

  it("coerces @parameters enum param to JSON Schema enum", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 * @parameters { lang: { type: "enum", enum: ["en", "fr", "es"], default: "en" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    const props = (asDyn(entry).paramsSchema as { properties: Record<string, unknown> })
      .properties;
    expect(props.lang).toEqual({
      enum: ["en", "fr", "es"],
      default: "en",
    });
  });

  it("rejects unsupported param type (e.g. 'uuid')", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 * @parameters { docId: { type: "uuid" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      stage: "signature-semantics",
      tag: "@parameters",
    });
    expect(errors[0].message).toContain('"uuid"');
  });

  it("rejects enum param without an enum array", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 * @parameters { lang: { type: "enum" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors[0]).toMatchObject({
      stage: "signature-semantics",
      tag: "@parameters",
    });
  });

  it("requires @parameters itself to be an object (not a string)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 * @parameters "nope"
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors[0]).toMatchObject({
      stage: "signature-semantics",
      tag: "@parameters",
    });
  });
});

describe("parseDynamicNodeSignature — US-159 Scenario 4: caps + defaults", () => {
  it("defaults @category to 'Custom' when omitted", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.category).toBe("Custom");
  });

  it("preserves an explicit @category", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @category MyBucket
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.category).toBe("MyBucket");
  });

  it("defaults @deterministic to false (nonCacheable=true)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.nonCacheable).toBe(true);
  });

  it("sets nonCacheable=false when @deterministic true", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @deterministic true
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.nonCacheable).toBe(false);
  });

  it("defaults @allowNet to [] when omitted", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.allowNet).toEqual([]);
  });

  it("defaults @timeoutMs to 60000 when omitted", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect((entry as unknown as { timeoutMs: number }).timeoutMs).toBe(60000);
  });

  it("defaults @maxMemoryMB to 256 when omitted", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect((entry as unknown as { maxMemoryMB: number }).maxMemoryMB).toBe(256);
  });

  it("silently clamps @timeoutMs > 60000 to the cap (NO error)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @timeoutMs 999999
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect((entry as unknown as { timeoutMs: number }).timeoutMs).toBe(60000);
  });

  it("silently clamps @maxMemoryMB > 256 to the cap (NO error)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @maxMemoryMB 4096
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect((entry as unknown as { maxMemoryMB: number }).maxMemoryMB).toBe(256);
  });

  it("preserves a value at or below the @timeoutMs cap", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @timeoutMs 30000
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect((entry as unknown as { timeoutMs: number }).timeoutMs).toBe(30000);
  });

  it("preserves a value at or below the @maxMemoryMB cap", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @maxMemoryMB 128
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect((entry as unknown as { maxMemoryMB: number }).maxMemoryMB).toBe(128);
  });

  it("preserves an explicit @allowNet array", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @allowNet ["a.example.com", "b.example.com"]
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.allowNet).toEqual(["a.example.com", "b.example.com"]);
  });
});

describe("parseDynamicNodeSignature — US-159 Scenario 5: derived entry assembly", () => {
  it("assembles a full entry on a complete valid script", () => {
    const script = `
/**
 * @workflow-node
 * @name extract-tables
 * @description Extracts tables from a PDF.
 * @category Custom
 * @deterministic false
 * @inputs { document: { kind: "Document", required: true, description: "Source PDF" } }
 * @outputs { tables: { kind: "OcrTable[]", description: "Extracted tables" } }
 * @parameters { minConfidence: { type: "number", default: 0.5, min: 0, max: 1 } }
 * @allowNet ["tabula.example.com"]
 * @timeoutMs 30000
 * @maxMemoryMB 128
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(entry).not.toBeNull();
    const e = entry as unknown as Record<string, unknown>;

    expect(e.type).toBe("dyn.extract-tables");
    expect(e.category).toBe("Custom");
    expect(e.description).toBe("Extracts tables from a PDF.");
    expect(e.iconHint).toBe("code");
    expect(e.colorHint).toBe("dyn");
    expect(e.nonCacheable).toBe(true); // !deterministic
    expect(e.dynamicNodeSlug).toBe("extract-tables");
    expect(e.dynamicNodeVersion).toBe(0); // placeholder
    expect(e.allowNet).toEqual(["tabula.example.com"]);
    expect(e.timeoutMs).toBe(30000);
    expect(e.maxMemoryMB).toBe(128);
    expect(e.paramsSchema).toEqual({
      type: "object",
      properties: {
        minConfidence: {
          type: "number",
          default: 0.5,
          minimum: 0,
          maximum: 1,
        },
      },
      required: [],
      additionalProperties: false,
    });
    expect(e.inputs).toEqual([
      {
        name: "document",
        label: "document",
        kind: "Document",
        required: true,
        description: "Source PDF",
      },
    ]);
    expect(e.outputs).toEqual([
      {
        name: "tables",
        label: "tables",
        kind: "OcrTable[]",
        description: "Extracted tables",
      },
    ]);
  });

  it("sets nonCacheable=false on a @deterministic true script", () => {
    const script = `
/**
 * @workflow-node
 * @name pure-transform
 * @description deterministic transform
 * @deterministic true
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.nonCacheable).toBe(false);
  });

  it("port descriptors omit `required` / `description` when not declared", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.inputs).toEqual([
      { name: "x", label: "x", kind: "Document" },
    ]);
    expect(entry!.outputs).toEqual([
      { name: "y", label: "y", kind: "Artifact" },
    ]);
  });

  it("preserves declaration order of ports", () => {
    const script = `
/**
 * @workflow-node
 * @name multi-port
 * @description does
 * @inputs { alpha: { kind: "Document" }, beta: { kind: "Document" }, gamma: { kind: "Document" } }
 * @outputs { z: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.inputs.map((p) => p.name)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("emits dynamicNodeVersion 0 as a placeholder (backend overwrites)", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry } = parseDynamicNodeSignature(script);
    expect(entry!.dynamicNodeVersion).toBe(0);
  });
});

describe("parseDynamicNodeSignature — US-159 Scenario 6: stage short-circuit + integration", () => {
  it("missing @workflow-node marker short-circuits before semantics runs (no semantics errors emitted)", () => {
    const script = `
/**
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    expect(errors).toEqual([
      {
        stage: "jsdoc-parse",
        message: "Missing @workflow-node marker",
        line: 1,
      },
    ]);
    // No semantics errors should appear.
    expect(errors.every((e) => e.stage === "jsdoc-parse")).toBe(true);
  });

  it("missing required tag short-circuits before semantics runs", () => {
    const script = `
/**
 * @workflow-node
 * @name my-node
 * @description does
 * @inputs { x: { kind: "Document" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    // Single missing-tag error from the jsdoc-parse stage; no semantics
    // errors layered on top.
    expect(errors).toHaveLength(1);
    expect(errors[0].stage).toBe("jsdoc-parse");
  });

  it("malformed @inputs JSON short-circuits before semantics runs", () => {
    const script = `
/**
 * @workflow-node
 * @name My-Invalid-Name
 * @description does
 * @inputs { unterminated
 * @outputs { y: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(entry).toBeNull();
    // The slug is invalid (capitals) AND @inputs is malformed. But because
    // the jsdoc-parse stage fails on the @inputs parse error (and @inputs
    // becomes a missing-required-tag), the semantics stage NEVER runs, so
    // the @name regex check is NOT emitted.
    expect(errors.every((e) => e.stage === "jsdoc-parse")).toBe(true);
    expect(errors.some((e) => e.stage === "signature-semantics")).toBe(false);
  });

  it("happy-path full script: zero errors, populated entry", () => {
    const script = `
/**
 * @workflow-node
 * @name happy-path
 * @description Smoke test.
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
    const { entry, errors } = parseDynamicNodeSignature(script);
    expect(errors).toEqual([]);
    expect(entry).not.toBeNull();
    expect(entry!.dynamicNodeSlug).toBe("happy-path");
  });
});
