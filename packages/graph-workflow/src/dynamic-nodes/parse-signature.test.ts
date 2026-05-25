/**
 * Tests for `parseDynamicNodeSignature` — Phase 6 JSDoc-parse stage (US-158).
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
 * US-158 always returns `entry: null` — US-159 wires entry assembly.
 */

import {
  parseDynamicNodeSignature,
  parseJsDocBlock,
} from "./parse-signature";
import type { JsDocParseError } from "./types";

// Re-import via the package barrel so the test simultaneously asserts the
// barrel re-export (Scenario 6).
import {
  parseDynamicNodeSignature as parseFromBarrel,
  parseJsDocBlock as parseBlockFromBarrel,
} from "../index";

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

  it("always returns entry: null in US-158 (semantics + assembly land in US-159)", () => {
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
    expect(parseDynamicNodeSignature(validScript).entry).toBeNull();
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

  it("happy path: only required tags — internal record has optional tags absent (defaults will be applied in US-159)", () => {
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
    expect(entry).toBeNull();
    const { block } = parseJsDocBlock(script);
    // Optional tags are absent in the parsed record — defaults are the
    // semantics layer's responsibility in US-159.
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
