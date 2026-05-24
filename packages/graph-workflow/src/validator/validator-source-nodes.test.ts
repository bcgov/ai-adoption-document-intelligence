/**
 * US-109: SourceNode structural validation + source.api ⇄ isInput warning.
 *
 * Exercises the five new save-time rules added to `validateGraphConfig`:
 *   1. SourceNode.inputs[] non-empty → error
 *   2. Unknown sourceType → error
 *   3. parameters failing the entry's `parametersSchema` → error
 *   4. Multi-source.api OR multi-source.upload → error (Phase 8.0 restriction)
 *   5. source.api + isInput-flagged ctx → soft WARNING (not error)
 *
 * The default `SOURCE_CATALOG` is empty at this milestone (US-115 + US-116
 * register the real `source.api` and `source.upload` entries). Tests inject
 * a synthetic catalog by passing a custom `getSourceCatalogEntry` lookup
 * via `ValidateGraphConfigOptions` — mirrors the US-108 adapter test
 * pattern without needing `jest.doMock` on the frozen registry.
 */
import { z } from "zod/v4";

import type {
  ActivityNode,
  GraphValidationError,
  GraphWorkflowConfig,
  SourceNode,
  ValidateGraphConfigOptions,
} from "../index";
import { validateGraphConfig } from "../index";
import type { SourceCatalogEntry } from "../catalog/source-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeEntry(
  type: string,
  parametersSchema: z.ZodType,
  overrides: Partial<SourceCatalogEntry> = {},
): SourceCatalogEntry {
  return {
    type,
    category: "source",
    displayName: `Fake ${type}`,
    description: "Synthetic source used in unit tests only",
    iconHint: "test",
    colorHint: "blue",
    parametersSchema,
    runtime: "push",
    outputKind: "Document",
    deriveOutputSchema: () => ({ type: "object" }),
    ...overrides,
  };
}

function syntheticCatalog(
  entries: SourceCatalogEntry[],
): (sourceType: string) => SourceCatalogEntry | undefined {
  return (sourceType: string) => entries.find((e) => e.type === sourceType);
}

function makeOptions(
  entries: SourceCatalogEntry[] = [],
): ValidateGraphConfigOptions {
  return {
    isRegisteredActivityType: () => true,
    validateActivityParameters: () => {},
    getSourceCatalogEntry: syntheticCatalog(entries),
  };
}

/**
 * Build a minimal graph where each `sourceNode` is wired to a shared
 * downstream activity. Sources are the entry point(s) of their own
 * branch — the activity (`downstream`) is set as `entryNodeId` so the
 * reachability check (which is BFS-from-entry only) doesn't fire
 * unrelated warnings on the source nodes themselves. Each source has
 * an outgoing edge into `downstream` so the source nodes are still
 * present in the graph topology.
 *
 * NOTE: The reachability pass walks forward from `entryNodeId` and
 * flags any node not visited as unreachable. With `downstream` as the
 * entry, the source nodes WOULD be flagged unreachable. To dodge that
 * (it's not what we're testing here), we set the FIRST source as the
 * entry node when sources are present. Multi-source tests live with
 * the reachability warning on the second+ source — but we filter via
 * `errorsForNode` and explicitly check error/warning severity in the
 * assertion, so it's a non-issue for the test intent.
 */
function configWith(
  sourceNodes: SourceNode[],
  ctx: GraphWorkflowConfig["ctx"] = {},
): GraphWorkflowConfig {
  const nodes: GraphWorkflowConfig["nodes"] = {
    downstream: {
      id: "downstream",
      type: "activity",
      label: "Downstream",
      activityType: "noop.activity",
    } as ActivityNode,
  };
  for (const sourceNode of sourceNodes) {
    nodes[sourceNode.id] = sourceNode;
  }
  const edges: GraphWorkflowConfig["edges"] = sourceNodes.map((s, idx) => ({
    id: `e${idx}`,
    source: s.id,
    target: "downstream",
    type: "normal",
  }));
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: sourceNodes[0]?.id ?? "downstream",
    ctx,
    nodes,
    edges,
  };
}

function errorsForNode(
  errors: GraphValidationError[],
  nodeId: string,
): GraphValidationError[] {
  return errors.filter((e) => e.path.startsWith(`nodes.${nodeId}`));
}

// ---------------------------------------------------------------------------
// Scenario 1: SourceNode with non-empty inputs[] rejected
// ---------------------------------------------------------------------------

describe("US-109 Scenario 1: SourceNode.inputs[] must be empty/absent", () => {
  it("emits an error when a source node declares non-empty inputs[]", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "API source",
      sourceType: "source.fake",
      inputs: [{ port: "anything", ctxKey: "foo" }],
    };
    const config = configWith(
      [sourceNode],
      { foo: { type: "string" } },
    );
    const result = validateGraphConfig(
      config,
      makeOptions([fakeEntry("source.fake", z.object({}).passthrough())]),
    );

    const inputsErrors = result.errors.filter(
      (e) => e.path === "nodes.src.inputs",
    );
    expect(inputsErrors).toHaveLength(1);
    expect(inputsErrors[0]).toEqual({
      path: "nodes.src.inputs",
      severity: "error",
      message: "Source node `src` cannot have inputs[]; sources have no upstream",
    });
    expect(result.valid).toBe(false);
  });

  it("passes when inputs is absent (default)", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "API source",
      sourceType: "source.fake",
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(
      config,
      makeOptions([fakeEntry("source.fake", z.object({}).passthrough())]),
    );

    const sourceErrors = errorsForNode(result.errors, "src");
    expect(sourceErrors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("passes when inputs is an empty array", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "API source",
      sourceType: "source.fake",
      inputs: [],
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(
      config,
      makeOptions([fakeEntry("source.fake", z.object({}).passthrough())]),
    );

    const sourceErrors = errorsForNode(result.errors, "src");
    expect(sourceErrors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Unknown sourceType rejected
// ---------------------------------------------------------------------------

describe("US-109 Scenario 2: unknown sourceType rejected with exact message", () => {
  it("emits an error referencing the unknown subtype against an empty catalog", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "Unknown",
      sourceType: "source.bogus",
    };
    const config = configWith([sourceNode]);
    // No synthetic entries → lookup returns undefined for every sourceType.
    const result = validateGraphConfig(config, makeOptions([]));

    const typeErrors = result.errors.filter(
      (e) => e.path === "nodes.src.sourceType",
    );
    expect(typeErrors).toHaveLength(1);
    expect(typeErrors[0]).toEqual({
      path: "nodes.src.sourceType",
      severity: "error",
      message:
        "Source node `src` references unknown source type `source.bogus`",
    });
    expect(result.valid).toBe(false);
  });

  it("does not run parameter validation when the sourceType is unknown", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "Unknown",
      sourceType: "source.bogus",
      parameters: { anything: 42 },
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(config, makeOptions([]));

    const paramErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.src.parameters"),
    );
    expect(paramErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: parameters failing parametersSchema rejected
// ---------------------------------------------------------------------------

describe("US-109 Scenario 3: parameters validated against entry parametersSchema", () => {
  it("emits an error with the Zod issue path + message", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "Bad params",
      sourceType: "source.fake",
      parameters: { mode: "weird" },
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(
      config,
      makeOptions([
        fakeEntry(
          "source.fake",
          z.object({ mode: z.enum(["push", "manual"]) }),
        ),
      ]),
    );

    const paramErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.src.parameters"),
    );
    expect(paramErrors).toHaveLength(1);
    expect(paramErrors[0]).toMatchObject({
      path: "nodes.src.parameters.mode",
      severity: "error",
    });
    expect(result.valid).toBe(false);
  });

  it("emits no parameter errors when parameters parse cleanly", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "Good params",
      sourceType: "source.fake",
      parameters: { mode: "push" },
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(
      config,
      makeOptions([
        fakeEntry(
          "source.fake",
          z.object({ mode: z.enum(["push", "manual"]) }),
        ),
      ]),
    );

    const sourceErrors = errorsForNode(result.errors, "src");
    expect(sourceErrors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("treats undefined parameters as empty object before parsing (matches adapter)", () => {
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "Missing required",
      sourceType: "source.fake",
      // parameters: undefined
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(
      config,
      makeOptions([
        fakeEntry(
          "source.fake",
          z.object({ requiredField: z.string() }),
        ),
      ]),
    );

    const paramErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.src.parameters"),
    );
    expect(paramErrors).toHaveLength(1);
    expect(paramErrors[0]?.path).toBe("nodes.src.parameters.requiredField");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Multi-source.api + multi-source.upload rejected
// ---------------------------------------------------------------------------

describe("US-109 Scenario 4: Phase 8.0 multi-source-subtype restriction", () => {
  const entries = [
    fakeEntry("source.api", z.object({}).passthrough()),
    fakeEntry("source.upload", z.object({}).passthrough()),
  ];

  it("rejects two source.api nodes", () => {
    const config = configWith([
      { id: "src1", type: "source", label: "API 1", sourceType: "source.api" },
      { id: "src2", type: "source", label: "API 2", sourceType: "source.api" },
    ]);
    const result = validateGraphConfig(config, makeOptions(entries));

    const multiErrors = result.errors.filter((e) =>
      e.message.startsWith("Phase 8.0 supports at most one source of subtype"),
    );
    expect(multiErrors).toHaveLength(1);
    expect(multiErrors[0]).toEqual({
      path: "nodes.src2.sourceType",
      severity: "error",
      message:
        "Phase 8.0 supports at most one source of subtype `source.api` per workflow — multi-source.api is deferred to Phase 8.x",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects two source.upload nodes", () => {
    const config = configWith([
      {
        id: "u1",
        type: "source",
        label: "Upload 1",
        sourceType: "source.upload",
      },
      {
        id: "u2",
        type: "source",
        label: "Upload 2",
        sourceType: "source.upload",
      },
    ]);
    const result = validateGraphConfig(config, makeOptions(entries));

    const multiErrors = result.errors.filter((e) =>
      e.message.startsWith("Phase 8.0 supports at most one source of subtype"),
    );
    expect(multiErrors).toHaveLength(1);
    expect(multiErrors[0]).toEqual({
      path: "nodes.u2.sourceType",
      severity: "error",
      message:
        "Phase 8.0 supports at most one source of subtype `source.upload` per workflow — multi-source.upload is deferred to Phase 8.x",
    });
    expect(result.valid).toBe(false);
  });

  it("accepts one source.api + one source.upload coexisting", () => {
    const config = configWith([
      {
        id: "api",
        type: "source",
        label: "API",
        sourceType: "source.api",
      },
      {
        id: "up",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
      },
    ]);
    const result = validateGraphConfig(config, makeOptions(entries));

    const multiErrors = result.errors.filter((e) =>
      e.message.startsWith("Phase 8.0 supports at most one source of subtype"),
    );
    expect(multiErrors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("emits one error per duplicate when three+ sources of the same subtype are present", () => {
    const config = configWith([
      { id: "a", type: "source", label: "A", sourceType: "source.api" },
      { id: "b", type: "source", label: "B", sourceType: "source.api" },
      { id: "c", type: "source", label: "C", sourceType: "source.api" },
    ]);
    const result = validateGraphConfig(config, makeOptions(entries));

    const multiErrors = result.errors.filter((e) =>
      e.message.startsWith("Phase 8.0 supports at most one source of subtype"),
    );
    expect(multiErrors).toHaveLength(2);
    expect(multiErrors.map((e) => e.path)).toEqual([
      "nodes.b.sourceType",
      "nodes.c.sourceType",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: source.api + isInput-flagged ctx → soft warning
// ---------------------------------------------------------------------------

describe("US-109 Scenario 5: source.api + isInput → warning (non-blocking)", () => {
  const entries = [fakeEntry("source.api", z.object({}).passthrough())];

  it("emits a single warning (not error) when source.api coexists with isInput ctx", () => {
    const config = configWith(
      [
        { id: "src", type: "source", label: "API", sourceType: "source.api" },
      ],
      {
        callerInput: { type: "string", isInput: true },
      },
    );
    const result = validateGraphConfig(config, makeOptions(entries));

    const ctxWarnings = result.errors.filter(
      (e) =>
        e.path === "metadata.ctx" &&
        e.message.includes("isInput flags on ctx declarations are ignored"),
    );
    expect(ctxWarnings).toHaveLength(1);
    expect(ctxWarnings[0]).toEqual({
      path: "metadata.ctx",
      severity: "warning",
      message:
        "Workflow has a source.api node — isInput flags on ctx declarations are ignored. Remove isInput flags or remove the source.api to clarify intent.",
    });
  });

  it("warnings do not block save: result.valid is true when only warnings present", () => {
    const config = configWith(
      [
        { id: "src", type: "source", label: "API", sourceType: "source.api" },
      ],
      {
        callerInput: { type: "string", isInput: true },
      },
    );
    const result = validateGraphConfig(config, makeOptions(entries));

    // Only the soft-warning is present — no errors.
    expect(result.errors.filter((e) => e.severity === "error")).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("does not emit the warning when isInput is absent", () => {
    const config = configWith(
      [
        { id: "src", type: "source", label: "API", sourceType: "source.api" },
      ],
      {
        someKey: { type: "string" },
      },
    );
    const result = validateGraphConfig(config, makeOptions(entries));

    const ctxWarnings = result.errors.filter(
      (e) =>
        e.path === "metadata.ctx" &&
        e.message.includes("isInput flags on ctx declarations are ignored"),
    );
    expect(ctxWarnings).toEqual([]);
  });

  it("does not emit the warning when there's no source.api node", () => {
    const config = configWith(
      [
        {
          id: "src",
          type: "source",
          label: "Upload",
          sourceType: "source.upload",
        },
      ],
      {
        callerInput: { type: "string", isInput: true },
      },
    );
    const result = validateGraphConfig(
      config,
      makeOptions([
        fakeEntry("source.upload", z.object({}).passthrough()),
      ]),
    );

    const ctxWarnings = result.errors.filter(
      (e) =>
        e.path === "metadata.ctx" &&
        e.message.includes("isInput flags on ctx declarations are ignored"),
    );
    expect(ctxWarnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Existing validator tests still green
// ---------------------------------------------------------------------------
//
// Covered by the unmodified `validator.test.ts` suite — extending
// `validateGraphConfig` with the new SourceNode pass must not regress
// the pre-existing 407-test suite. The `getSourceCatalogEntry` option
// is OPTIONAL (defaults to the imported `getSourceCatalogEntry` against
// the empty `SOURCE_CATALOG`), so existing fixtures that omit it
// continue to validate cleanly — provided they don't include source
// nodes (which is true today; the visual builder gains source nodes
// only when the Phase 8 milestones land downstream).
//
// This file is verified together with `validator.test.ts` via the
// package-level `npm test` run.

// ---------------------------------------------------------------------------
// US-110: Binding-walk integration — source nodes as kind-bearing producers
//
// Extends the Phase 3 binding-walk pass (US-093) so source-node outputs
// are enumerated as ctx producers and feed the same producer/consumer
// kind-mismatch check that activity ports, ctx declarations, and library
// port descriptors already feed. Tests fabricate synthetic
// `SourceCatalogEntry` fixtures (no dependency on US-115 / US-116) and
// install synthetic `ACTIVITY_CATALOG` entries on the consumer side to
// model downstream activities with typed input ports.
// ---------------------------------------------------------------------------

describe("US-110 Scenario 1: source.api fields[] enumerated as ctx producers", () => {
  it("treats each field's `kind?` as the producer kind (matching consumer passes)", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const consumerEntry = {
      activityType: "test.us110.consumeSegments",
      displayName: "Consume Segments",
      category: "Document Handling",
      description: "synthetic consumer",
      iconHint: "seg",
      colorHint: "green",
      inputs: [{ name: "pages", label: "Pages", kind: "Segment[]" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const sourceNode: SourceNode = {
        id: "src",
        type: "source",
        label: "API source",
        sourceType: "source.api",
        parameters: {
          fields: [
            { name: "pages", type: "array", kind: "Segment[]", required: true },
          ],
        },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "src",
        ctx: { pages: { type: "array" } },
        nodes: {
          src: sourceNode,
          consumer: {
            id: "consumer",
            type: "activity",
            label: "Consumer",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "pages", ctxKey: "pages" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e", source: "src", target: "consumer", type: "normal" },
        ],
      };

      const result = validateGraphConfig(
        config,
        makeOptions([fakeEntry("source.api", z.object({}).passthrough())]),
      );

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toEqual([]);
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });

  it("defaults the producer kind to `Artifact` when a field omits `kind?`", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    // Consumer port has NO kind annotation → Artifact wildcard → matches anything.
    const consumerEntry = {
      activityType: "test.us110.consumeAnything",
      displayName: "Consume Anything",
      category: "Document Handling",
      description: "synthetic consumer w/o kind",
      iconHint: "any",
      colorHint: "gray",
      inputs: [{ name: "priority", label: "Priority" }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const sourceNode: SourceNode = {
        id: "src",
        type: "source",
        label: "API source",
        sourceType: "source.api",
        parameters: {
          fields: [
            // No `kind?` → producer kind defaults to "Artifact".
            { name: "priority", type: "number", required: false },
          ],
        },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "src",
        ctx: { priority: { type: "number" } },
        nodes: {
          src: sourceNode,
          consumer: {
            id: "consumer",
            type: "activity",
            label: "Consumer",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "priority", ctxKey: "priority" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e", source: "src", target: "consumer", type: "normal" },
        ],
      };

      const result = validateGraphConfig(
        config,
        makeOptions([fakeEntry("source.api", z.object({}).passthrough())]),
      );

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toEqual([]);
      expect(result.valid).toBe(true);
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });
});

describe("US-110 Scenario 2: source.upload ctxKey enumerated as a Document producer", () => {
  it("contributes a Document producer at the configured ctxKey (matching Document consumer passes)", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const consumerEntry = {
      activityType: "test.us110.consumeDocument",
      displayName: "Consume Document",
      category: "Document Handling",
      description: "synthetic Document consumer",
      iconHint: "doc",
      colorHint: "blue",
      inputs: [{ name: "doc", label: "Doc", kind: "Document" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const sourceNode: SourceNode = {
        id: "src",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
        parameters: { ctxKey: "myFile" },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "src",
        ctx: { myFile: { type: "string" } },
        nodes: {
          src: sourceNode,
          consumer: {
            id: "consumer",
            type: "activity",
            label: "Consumer",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "doc", ctxKey: "myFile" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e", source: "src", target: "consumer", type: "normal" },
        ],
      };

      const result = validateGraphConfig(
        config,
        makeOptions([
          // fakeEntry sets outputKind: "Document" by default — matches the
          // real source.upload subtype's outputKind from US-116.
          fakeEntry("source.upload", z.object({}).passthrough()),
        ]),
      );

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toEqual([]);
      expect(result.valid).toBe(true);
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });

  it("defaults the ctxKey to `documentUrl` when parameters.ctxKey is absent", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    // Mismatched consumer kind (`Segment`) at ctx key `documentUrl` proves
    // the producer was enumerated at that key with kind `Document`.
    const consumerEntry = {
      activityType: "test.us110.consumeSegmentAtDefault",
      displayName: "Consume Segment",
      category: "Document Handling",
      description: "synthetic Segment consumer to prove the default ctxKey",
      iconHint: "seg",
      colorHint: "green",
      inputs: [{ name: "seg", label: "Seg", kind: "Segment" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const sourceNode: SourceNode = {
        id: "src",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
        // parameters.ctxKey absent → default "documentUrl"
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "src",
        ctx: { documentUrl: { type: "string" } },
        nodes: {
          src: sourceNode,
          consumer: {
            id: "consumer",
            type: "activity",
            label: "Consumer",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "seg", ctxKey: "documentUrl" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e", source: "src", target: "consumer", type: "normal" },
        ],
      };

      const result = validateGraphConfig(
        config,
        makeOptions([
          fakeEntry("source.upload", z.object({}).passthrough()),
        ]),
      );

      // Document (producer) is NOT assignable to Segment (consumer) — proves
      // the source.upload producer was enumerated at the default ctx key.
      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toHaveLength(1);
      expect(mismatchErrors[0]).toEqual({
        severity: "error",
        path: "nodes.consumer.inputs.seg",
        message:
          "Input port `seg` (Segment) on node `consumer` reads from ctx key `documentUrl`, written by node `src` (Document) — Document not assignable to Segment",
      });
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });
});

describe("US-110 Scenario 3: mismatched source field → consumer port surfaces standard binding-walk error", () => {
  it("emits the exact Phase 3 error wording when a source.api field's kind isn't assignable to the consumer port", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const consumerEntry = {
      activityType: "test.us110.classify",
      displayName: "Classify",
      category: "Document Handling",
      description: "synthetic single-Segment consumer",
      iconHint: "cls",
      colorHint: "red",
      // Consumer wants a single Segment — NOT an array.
      inputs: [{ name: "segment", label: "Segment", kind: "Segment" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const sourceNode: SourceNode = {
        id: "apiSrc",
        type: "source",
        label: "API source",
        sourceType: "source.api",
        parameters: {
          fields: [
            // Source produces Segment[] — cardinality mismatch vs Segment.
            { name: "pages", type: "array", kind: "Segment[]", required: true },
          ],
        },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "apiSrc",
        ctx: { pages: { type: "array" } },
        nodes: {
          apiSrc: sourceNode,
          classify: {
            id: "classify",
            type: "activity",
            label: "Classify",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "segment", ctxKey: "pages" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e", source: "apiSrc", target: "classify", type: "normal" },
        ],
      };

      const result = validateGraphConfig(
        config,
        makeOptions([fakeEntry("source.api", z.object({}).passthrough())]),
      );

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toHaveLength(1);
      expect(mismatchErrors[0]).toEqual({
        severity: "error",
        path: "nodes.classify.inputs.segment",
        message:
          "Input port `segment` (Segment) on node `classify` reads from ctx key `pages`, written by node `apiSrc` (Segment[]) — Segment[] not assignable to Segment",
      });
      expect(result.valid).toBe(false);
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });
});

describe("US-110 Scenario 4: synthetic catalog entries drive the producer enumeration", () => {
  it("skips producer enumeration when the sourceType is unknown (no double-error noise)", () => {
    // No synthetic entries registered → `getSourceCatalogEntry(...)` returns
    // undefined; the binding-walk skips this source so the only error is the
    // structural one from US-109, not a phantom binding-walk error.
    const sourceNode: SourceNode = {
      id: "src",
      type: "source",
      label: "Unknown",
      sourceType: "source.bogus",
      parameters: {
        fields: [
          { name: "anything", type: "string", kind: "Segment", required: false },
        ],
      },
    };
    const config = configWith([sourceNode]);
    const result = validateGraphConfig(config, makeOptions([]));

    // No binding-walk "not assignable" errors should be emitted.
    const mismatchErrors = result.errors.filter((e) =>
      e.message.includes("not assignable"),
    );
    expect(mismatchErrors).toEqual([]);
    // The structural US-109 error IS still expected (unknown source type).
    const typeErrors = result.errors.filter(
      (e) => e.path === "nodes.src.sourceType",
    );
    expect(typeErrors).toHaveLength(1);
  });

  it("uses the injected getSourceCatalogEntry option (not the default empty catalog)", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    // If the walker had ignored the injected option and consulted the
    // default empty SOURCE_CATALOG, no producer would be enumerated for
    // `source.upload` and the mismatch below would NOT fire.
    const consumerEntry = {
      activityType: "test.us110.consumeSegmentInjected",
      displayName: "Consume Segment (injected)",
      category: "Document Handling",
      description: "synthetic Segment consumer",
      iconHint: "seg",
      colorHint: "green",
      inputs: [{ name: "seg", label: "Seg", kind: "Segment" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const sourceNode: SourceNode = {
        id: "src",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
        parameters: { ctxKey: "myFile" },
      };
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "src",
        ctx: { myFile: { type: "string" } },
        nodes: {
          src: sourceNode,
          consumer: {
            id: "consumer",
            type: "activity",
            label: "Consumer",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "seg", ctxKey: "myFile" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e", source: "src", target: "consumer", type: "normal" },
        ],
      };

      const result = validateGraphConfig(
        config,
        makeOptions([
          // outputKind: "Document" by default — mismatch with Segment consumer.
          fakeEntry("source.upload", z.object({}).passthrough()),
        ]),
      );

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toHaveLength(1);
      expect(mismatchErrors[0].message).toBe(
        "Input port `seg` (Segment) on node `consumer` reads from ctx key `myFile`, written by node `src` (Document) — Document not assignable to Segment",
      );
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });
});
