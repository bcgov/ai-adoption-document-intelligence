/**
 * Validation surfacing tests for control-flow node misconfigurations.
 *
 * Covers US-013 acceptance criteria: confirm that `validateGraphConfig`
 * emits structured `GraphValidationError` entries for the three primary
 * control-flow shapes (switch with no cases + no defaultEdge, join whose
 * `sourceMapNodeId` points at a non-map / missing node, pollUntil with
 * an unparseable `interval`). Each surfaced error includes the node's
 * path (`nodes.<id>...`) — which is exactly how the frontend
 * `useGraphValidation` hook buckets errors per node for the canvas red
 * badges and the validation drawer.
 *
 * Also covers US-052 — `validateActivityParameters` runs on `pollUntil`
 * nodes (the catalog parameters of the polled activity get the same
 * Zod validation that activity nodes already get).
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

import type {
  ActivityNode,
  ChildWorkflowNode,
  GraphValidationError,
  GraphWorkflowConfig,
  HumanGateNode,
  JoinNode,
  PollUntilNode,
  SwitchNode,
  ValidateGraphConfigOptions,
} from "../index";
import { validateGraphConfig } from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal validator-options stub. The validator tolerates any registered
 * activity type via this callback; tests that don't care about activity-
 * type validation just answer `true` to everything.
 */
const ALWAYS_REGISTERED_OPTIONS: ValidateGraphConfigOptions = {
  isRegisteredActivityType: () => true,
  validateActivityParameters: () => {},
};

function errorsForNode(
  errors: GraphValidationError[],
  nodeId: string,
): GraphValidationError[] {
  return errors.filter((e) => e.path.startsWith(`nodes.${nodeId}`));
}

// ---------------------------------------------------------------------------
// Scenario 1: Switch with empty cases and no defaultEdge
// ---------------------------------------------------------------------------

describe("US-013 Scenario 1: switch with no cases + no defaultEdge", () => {
  it("emits a validation error mentioning defaultEdge for the switch node", () => {
    const switchNode: SwitchNode = {
      id: "sw",
      type: "switch",
      label: "Empty switch",
      cases: [],
    };
    const downstream: ActivityNode = {
      id: "downstream",
      type: "activity",
      label: "Downstream",
      activityType: "noop.activity",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "sw",
      ctx: {},
      nodes: { sw: switchNode, downstream },
      edges: [{ id: "e1", source: "sw", target: "downstream", type: "normal" }],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(false);
    const switchErrors = errorsForNode(result.errors, "sw");
    expect(switchErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.sw.defaultEdge",
          severity: "error",
          message: expect.stringContaining("defaultEdge"),
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Join sourceMapNodeId pointing at a non-map / deleted node
// ---------------------------------------------------------------------------

describe("US-013 Scenario 2: join.sourceMapNodeId pointing at wrong / missing node", () => {
  it("emits a validation error when sourceMapNodeId points at an activity node (not a map)", () => {
    const activity: ActivityNode = {
      id: "activityA",
      type: "activity",
      label: "Not a map",
      activityType: "noop.activity",
    };
    const join: JoinNode = {
      id: "join1",
      type: "join",
      label: "Bad join",
      sourceMapNodeId: "activityA",
      strategy: "all",
      resultsCtxKey: "results",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "activityA",
      ctx: { results: { type: "array" } },
      nodes: { activityA: activity, join1: join },
      edges: [
        { id: "e1", source: "activityA", target: "join1", type: "normal" },
      ],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(false);
    const joinErrors = errorsForNode(result.errors, "join1");
    expect(joinErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.join1.sourceMapNodeId",
          severity: "error",
          message: expect.stringMatching(/not a "map" node|references a/),
        }),
      ]),
    );
  });

  it("emits a validation error when sourceMapNodeId points at a deleted (non-existent) node id", () => {
    const activity: ActivityNode = {
      id: "activityA",
      type: "activity",
      label: "Entry",
      activityType: "noop.activity",
    };
    const join: JoinNode = {
      id: "join1",
      type: "join",
      label: "Dangling join",
      sourceMapNodeId: "this-node-was-deleted",
      strategy: "all",
      resultsCtxKey: "results",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "activityA",
      ctx: { results: { type: "array" } },
      nodes: { activityA: activity, join1: join },
      edges: [
        { id: "e1", source: "activityA", target: "join1", type: "normal" },
      ],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(false);
    const joinErrors = errorsForNode(result.errors, "join1");
    expect(joinErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.join1.sourceMapNodeId",
          severity: "error",
          message: expect.stringContaining("non-existent sourceMapNodeId"),
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: PollUntil with an invalid `interval`
// ---------------------------------------------------------------------------

describe("US-013 Scenario 3: pollUntil with invalid `interval`", () => {
  /**
   * US-051 closed the gap previously documented here. The validator now
   * calls the shared `isValidTemporalDuration` helper on
   * `pollUntil.interval` and surfaces an "Invalid Temporal duration"
   * error at `nodes.<id>.interval` — matching the frontend's
   * `PollUntilNodeSettings` inline-error behaviour.
   */
  it("surfaces an `interval` error for `interval: not-a-duration`", () => {
    const pollNode: PollUntilNode = {
      id: "poll1",
      type: "pollUntil",
      label: "Bad interval",
      activityType: "noop.activity",
      condition: {
        operator: "equals",
        left: { ref: "ctx.status" },
        right: { literal: "done" },
      },
      interval: "not-a-duration",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "poll1",
      ctx: { status: { type: "string" } },
      nodes: { poll1: pollNode },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    const intervalErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.poll1.interval"),
    );
    expect(intervalErrors).toEqual([
      expect.objectContaining({
        path: "nodes.poll1.interval",
        message: "Invalid Temporal duration",
        severity: "error",
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// US-052: `validateActivityParameters` runs on `pollUntil` nodes
// ---------------------------------------------------------------------------

/**
 * Stub helper that pushes a catalog-style parameter error whenever the
 * callback is invoked with an activity type listed in `failingTypes`.
 * Mirrors how the apps wire `createParameterValidator` into the shared
 * validator (the apps push errors with paths like
 * `nodes.<id>.parameters.<field>`).
 */
function makeOptions(
  failingTypes: Record<string, string>,
  registered: (type: string) => boolean = () => true,
): ValidateGraphConfigOptions {
  return {
    isRegisteredActivityType: registered,
    validateActivityParameters: (activityType, nodeId, _parameters, errors) => {
      const field = failingTypes[activityType];
      if (!field) return;
      errors.push({
        path: `nodes.${nodeId}.parameters.${field}`,
        message: `Invalid parameter "${field}" for activity "${activityType}"`,
        severity: "error",
      });
    },
  };
}

describe("US-052 Scenario 1: pollUntil parameters are catalog-validated", () => {
  it("surfaces an error at `nodes.<id>.parameters.<field>` when the polled activity's parameters violate the catalog schema", () => {
    const pollNode: PollUntilNode = {
      id: "pollA",
      type: "pollUntil",
      label: "Poll with bad params",
      activityType: "azureOcr.poll",
      condition: {
        operator: "equals",
        left: { ref: "ctx.status" },
        right: { literal: "done" },
      },
      interval: "10s",
      parameters: { unknownKey: "oops" },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "pollA",
      ctx: { status: { type: "string" } },
      nodes: { pollA: pollNode },
      edges: [],
    };

    const options = makeOptions({ "azureOcr.poll": "unknownKey" });
    const result = validateGraphConfig(config, options);

    const paramErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.pollA.parameters."),
    );
    expect(paramErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.pollA.parameters.unknownKey",
          severity: "error",
        }),
      ]),
    );
    expect(result.valid).toBe(false);
  });

  it("invokes `validateActivityParameters` with the polled activity type, node id, and parameters object", () => {
    const pollNode: PollUntilNode = {
      id: "pollB",
      type: "pollUntil",
      label: "Poll",
      activityType: "azureOcr.poll",
      condition: {
        operator: "equals",
        left: { ref: "ctx.status" },
        right: { literal: "done" },
      },
      interval: "10s",
      parameters: { foo: "bar" },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "pollB",
      ctx: { status: { type: "string" } },
      nodes: { pollB: pollNode },
      edges: [],
    };

    const calls: Array<{
      activityType: string;
      nodeId: string;
      parameters: Record<string, unknown> | undefined;
    }> = [];
    const options: ValidateGraphConfigOptions = {
      isRegisteredActivityType: () => true,
      validateActivityParameters: (activityType, nodeId, parameters) => {
        calls.push({ activityType, nodeId, parameters });
      },
    };

    validateGraphConfig(config, options);

    expect(calls).toEqual([
      {
        activityType: "azureOcr.poll",
        nodeId: "pollB",
        parameters: { foo: "bar" },
      },
    ]);
  });
});

describe("US-052 Scenario 2: parameter validation skipped when activityType is unregistered", () => {
  it("surfaces only the registration error and does NOT invoke `validateActivityParameters`", () => {
    const pollNode: PollUntilNode = {
      id: "pollC",
      type: "pollUntil",
      label: "Poll with unknown activity type",
      activityType: "totallyMadeUp.activity",
      condition: {
        operator: "equals",
        left: { ref: "ctx.status" },
        right: { literal: "done" },
      },
      interval: "10s",
      parameters: { whatever: 1 },
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "pollC",
      ctx: { status: { type: "string" } },
      nodes: { pollC: pollNode },
      edges: [],
    };

    let paramValidationCalls = 0;
    const options: ValidateGraphConfigOptions = {
      isRegisteredActivityType: () => false,
      validateActivityParameters: () => {
        paramValidationCalls += 1;
      },
    };

    const result = validateGraphConfig(config, options);

    expect(paramValidationCalls).toBe(0);
    const pollCErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.pollC"),
    );
    expect(pollCErrors).toEqual([
      expect.objectContaining({
        path: "nodes.pollC.activityType",
        severity: "error",
        message: expect.stringContaining("not registered"),
      }),
    ]);
  });
});

describe("US-052 Scenario 3: pre-existing pollUntil templates raise zero new errors", () => {
  const templatesDir = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "docs-md",
    "graph-workflows",
    "templates",
  );

  function loadTemplates(): Array<{ name: string; config: GraphWorkflowConfig }> {
    const entries = readdirSync(templatesDir);
    return entries
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        const raw = readFileSync(path.join(templatesDir, name), "utf8");
        const parsed = JSON.parse(raw) as GraphWorkflowConfig;
        return { name, config: parsed };
      });
  }

  function hasPollUntilNode(config: GraphWorkflowConfig): boolean {
    return Object.values(config.nodes).some((n) => n.type === "pollUntil");
  }

  it.each(
    loadTemplates()
      .filter(({ config }) => hasPollUntilNode(config))
      .map(({ name, config }) => [name, config] as const),
  )(
    "template %s: pollUntil nodes raise no `parameters.*` errors under the no-op param validator",
    (_name, config) => {
      // ALWAYS_REGISTERED_OPTIONS' `validateActivityParameters` is a
      // no-op — so the only way a `nodes.<pollId>.parameters.*` error
      // could appear is if the validator itself were synthesizing one.
      // The US-052 change is purely a delegation hook; templates must
      // remain clean.
      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

      const pollUntilNodeIds = Object.entries(config.nodes)
        .filter(([, n]) => n.type === "pollUntil")
        .map(([id]) => id);

      const newParamErrors = result.errors.filter((e) =>
        pollUntilNodeIds.some((id) =>
          e.path.startsWith(`nodes.${id}.parameters.`),
        ),
      );
      expect(newParamErrors).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// US-051: shared duration validation across pollUntil + humanGate
// ---------------------------------------------------------------------------

/**
 * Builds a `pollUntil` node with the supplied duration field overrides.
 * Defaults are valid Temporal durations so each test only varies the
 * field under inspection.
 */
function makePollNode(overrides: {
  interval?: string;
  initialDelay?: string;
  timeout?: string;
}): PollUntilNode {
  return {
    id: "poll1",
    type: "pollUntil",
    label: "Poll",
    activityType: "noop.activity",
    condition: {
      operator: "equals",
      left: { ref: "ctx.status" },
      right: { literal: "done" },
    },
    interval: overrides.interval ?? "10s",
    initialDelay: overrides.initialDelay,
    timeout: overrides.timeout,
  };
}

function makePollConfig(node: PollUntilNode): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: node.id,
    ctx: { status: { type: "string" } },
    nodes: { [node.id]: node },
    edges: [],
  };
}

describe("US-051 Scenario 3: validator surfaces invalid duration at the field path", () => {
  it("emits an error at `nodes.<id>.interval` for `interval: \"5\"`", () => {
    const config = makePollConfig(makePollNode({ interval: "5" }));
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.poll1.interval",
          message: "Invalid Temporal duration",
          severity: "error",
        }),
      ]),
    );
  });
});

describe("US-051 Scenario 4: coverage across the four duration fields", () => {
  it("flags `pollUntil.interval` when invalid", () => {
    const config = makePollConfig(makePollNode({ interval: "abc" }));
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.poll1.interval",
          message: "Invalid Temporal duration",
          severity: "error",
        }),
      ]),
    );
  });

  it("flags `pollUntil.initialDelay` when invalid", () => {
    const config = makePollConfig(
      makePollNode({ initialDelay: "1.5s" }),
    );
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.poll1.initialDelay",
          message: "Invalid Temporal duration",
          severity: "error",
        }),
      ]),
    );
  });

  it("flags `pollUntil.timeout` when invalid", () => {
    const config = makePollConfig(makePollNode({ timeout: "-30s" }));
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.poll1.timeout",
          message: "Invalid Temporal duration",
          severity: "error",
        }),
      ]),
    );
  });

  it("flags `humanGate.timeout` when invalid", () => {
    const gate: HumanGateNode = {
      id: "gate1",
      type: "humanGate",
      label: "Wait for approval",
      signal: { name: "approve" },
      timeout: "30",
      onTimeout: "fail",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "gate1",
      ctx: {},
      nodes: { gate1: gate },
      edges: [],
    };
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nodes.gate1.timeout",
          message: "Invalid Temporal duration",
          severity: "error",
        }),
      ]),
    );
  });

  it("does not flag optional duration fields when omitted", () => {
    // Only `interval` is set (and it's valid); `initialDelay` and
    // `timeout` are undefined — defensive `undefined` handling in
    // `isValidTemporalDuration` keeps these fields error-free.
    const config = makePollConfig(makePollNode({}));
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    const durationErrors = result.errors.filter((e) =>
      ["nodes.poll1.interval", "nodes.poll1.initialDelay", "nodes.poll1.timeout"].includes(
        e.path,
      ),
    );
    expect(durationErrors).toEqual([]);
  });

  it("accepts a valid `humanGate.timeout`", () => {
    const gate: HumanGateNode = {
      id: "gate1",
      type: "humanGate",
      label: "Wait for approval",
      signal: { name: "approve" },
      timeout: "1h30m",
      onTimeout: "fail",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "gate1",
      ctx: {},
      nodes: { gate1: gate },
      edges: [],
    };
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    const timeoutErrors = result.errors.filter(
      (e) => e.path === "nodes.gate1.timeout",
    );
    expect(timeoutErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US-056: Validator accepts the new library-workflow metadata fields
// ---------------------------------------------------------------------------

describe("US-056 Scenario 1: validator accepts metadata.kind = 'library' with declared inputs[] / outputs[]", () => {
  it("returns valid for a minimal config carrying full library metadata", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Sample library",
        description: "Round-tripped library signature",
        kind: "library",
        inputs: [
          { label: "Document URL", path: "ctx.documentUrl", type: "string" },
          { label: "Confidence", path: "ctx.threshold", type: "number" },
        ],
        outputs: [
          { label: "Extracted Fields", path: "ctx.fields", type: "object" },
        ],
      },
      entryNodeId: "noop",
      ctx: {
        documentUrl: { type: "string" },
        threshold: { type: "number" },
        fields: { type: "object" },
      },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("US-056 Scenario 2: validator accepts a config with no metadata.kind set", () => {
  it("returns valid for a minimal config whose metadata omits the library fields", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Legacy" },
      entryNodeId: "noop",
      ctx: {},
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US-065: Validator accepts CtxDeclaration.isInput?: boolean
// ---------------------------------------------------------------------------

describe("US-065 Scenario 3: validator accepts ctx declarations flagged as caller-supplied inputs", () => {
  it("returns valid for a config with isInput: true on ctx entries", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Run-as-API" },
      entryNodeId: "noop",
      ctx: {
        customerId: {
          type: "string",
          description: "Customer to process",
          isInput: true,
        },
        optionalFlag: {
          type: "boolean",
          defaultValue: false,
          isInput: true,
        },
        internalCounter: {
          type: "number",
        },
      },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US-076: ChildWorkflowNode.workflowRef.library accepts optional version?
// ---------------------------------------------------------------------------

describe("US-076: ChildWorkflowNode library workflowRef accepts optional version", () => {
  it("validates a library workflowRef without a `version` field (head-resolution shape)", () => {
    const childNode: ChildWorkflowNode = {
      id: "child",
      type: "childWorkflow",
      label: "Run library child",
      workflowRef: {
        type: "library",
        workflowId: "lib-abc",
      },
    };

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Parent calling library head" },
      entryNodeId: "child",
      ctx: {},
      nodes: { child: childNode },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates a library workflowRef with `version: 3` (pinned-version shape)", () => {
    const childNode: ChildWorkflowNode = {
      id: "child",
      type: "childWorkflow",
      label: "Run pinned library child",
      workflowRef: {
        type: "library",
        workflowId: "lib-abc",
        version: 3,
      },
    };

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Parent pinned to library v3" },
      entryNodeId: "child",
      ctx: {},
      nodes: { child: childNode },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US-092: Three schema shapes grow optional `kind?: KindRef`
// (PortDescriptor, CtxDeclaration, LibraryPortDescriptor). The validator
// does NOT yet inspect the `kind` field (binding-walk lands in US-093).
// These tests assert the new field is accepted — i.e. a shape carrying
// `kind` validates the same as a shape without it.
// ---------------------------------------------------------------------------

describe("US-092 Scenario 1: PortDescriptor.kind is accepted by the validator", () => {
  it("accepts a catalog `PortDescriptor` literal carrying `kind` and the workflow still validates", () => {
    // Catalog entries are not embedded in the workflow config; the
    // validator only sees them via the `isRegisteredActivityType` /
    // `validateActivityParameters` callbacks. To assert the optional
    // `kind` field is part of the public surface for catalog authors,
    // construct a `PortDescriptor` literal that uses `kind`. If `kind`
    // weren't on the interface this would be a compile error — and
    // the test's runtime read of `port.kind` confirms it's plain data.
    const port: import("../catalog/types").PortDescriptor = {
      name: "document",
      label: "Document",
      required: true,
      kind: "Document",
    };

    // Workflow side: any minimal valid config that exercises the
    // validator. The validator does not (yet) inspect `port.kind` —
    // US-093 lands the binding-walk pass.
    const activity: ActivityNode = {
      id: "a1",
      type: "activity",
      label: "Read",
      activityType: "noop.activity",
    };
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Activity beside kind-annotated catalog port" },
      entryNodeId: "a1",
      ctx: {},
      nodes: { a1: activity },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(port.kind).toBe("Document");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("US-092 Scenario 2: CtxDeclaration.kind is accepted by the validator", () => {
  it("returns valid for a config whose ctx declaration carries `kind: 'Document'`", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Ctx with typed-I/O kind" },
      entryNodeId: "noop",
      ctx: {
        foo: {
          type: "object",
          description: "A document on the blackboard",
          kind: "Document",
        },
      },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("US-092 Scenario 3: LibraryPortDescriptor.kind is accepted by the validator", () => {
  it("returns valid for a library config whose input descriptor carries `kind: 'Document'`", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Library with typed input",
        kind: "library",
        inputs: [
          {
            label: "Source Document",
            path: "ctx.documentUrl",
            type: "string",
            kind: "Document",
          },
        ],
        outputs: [
          { label: "Fields", path: "ctx.fields", type: "object" },
        ],
      },
      entryNodeId: "noop",
      ctx: {
        documentUrl: { type: "string", kind: "Document" },
        fields: { type: "object" },
      },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// US-093: Binding-walk type-check pass
//
// The walker iterates ctx keys, collects (producer, consumer) pairs from
// every node's port bindings, resolves each port's `kind` via the three
// declared sources (activity catalog `PortDescriptor.kind` →
// `CtxDeclaration.kind` → `LibraryPortDescriptor.kind`), and emits an
// error anchored to the consumer port for every (producer, consumer) pair
// where `isAssignable(producerKind, consumerKind)` is `false`.
// ---------------------------------------------------------------------------

describe("US-093 Scenario 1: producer → consumer kind mismatch surfaces an error", () => {
  it("anchors the error to the consumer port and includes both node ids in the message", () => {
    // We build the mismatch by INSTALLING two synthetic catalog entries
    // — one whose output port declares `kind: "Document"`, one whose
    // input port declares `kind: "Segment"` — for the duration of the
    // test, then restoring the catalog.
    const { ACTIVITY_CATALOG } = require("../catalog");
    const writerEntry = {
      activityType: "test.writeDoc",
      displayName: "Test Write Document",
      category: "Document Handling",
      description: "synthetic test producer",
      iconHint: "doc",
      colorHint: "blue",
      inputs: [],
      outputs: [
        { name: "doc", label: "Doc", kind: "Document" as const },
      ],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    const readerEntry = {
      activityType: "test.readSegment",
      displayName: "Test Read Segment",
      category: "Document Handling",
      description: "synthetic test consumer",
      iconHint: "seg",
      colorHint: "green",
      inputs: [
        { name: "seg", label: "Seg", kind: "Segment" as const },
      ],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[writerEntry.activityType] = writerEntry;
    ACTIVITY_CATALOG[readerEntry.activityType] = readerEntry;
    try {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "Producer Document → Consumer Segment" },
        entryNodeId: "A",
        ctx: { docRef: { type: "object" } },
        nodes: {
          A: {
            id: "A",
            type: "activity",
            label: "Writer A",
            activityType: "test.writeDoc",
            outputs: [{ port: "doc", ctxKey: "docRef" }],
          } as ActivityNode,
          B: {
            id: "B",
            type: "activity",
            label: "Reader B",
            activityType: "test.readSegment",
            inputs: [{ port: "seg", ctxKey: "docRef" }],
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toHaveLength(1);
      expect(mismatchErrors[0]).toEqual({
        severity: "error",
        path: "nodes.B.inputs.seg",
        message:
          "Input port `seg` (Segment) on node `B` reads from ctx key `docRef`, written by node `A` (Document) — Document not assignable to Segment",
      });
    } finally {
      delete ACTIVITY_CATALOG[writerEntry.activityType];
      delete ACTIVITY_CATALOG[readerEntry.activityType];
    }
  });
});

describe("US-093 Scenario 2: multi-producer mismatch — only the offending producer is reported", () => {
  it("emits exactly one error naming the mismatching producer when one of two producers is incompatible", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const producerDocEntry = {
      activityType: "test.produceDoc",
      displayName: "Test Producer Document",
      category: "Document Handling",
      description: "doc producer",
      iconHint: "doc",
      colorHint: "blue",
      inputs: [],
      outputs: [
        { name: "out", label: "Out", kind: "Document" as const },
      ],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    const producerRefEntry = {
      activityType: "test.produceRef",
      displayName: "Test Producer Reference",
      category: "Document Handling",
      description: "ref producer",
      iconHint: "ref",
      colorHint: "orange",
      inputs: [],
      outputs: [
        { name: "out", label: "Out", kind: "Reference" as const },
      ],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    const consumerDocEntry = {
      activityType: "test.consumeDoc",
      displayName: "Test Consumer Document",
      category: "Document Handling",
      description: "doc consumer",
      iconHint: "doc",
      colorHint: "blue",
      inputs: [
        { name: "in", label: "In", kind: "Document" as const },
      ],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[producerDocEntry.activityType] = producerDocEntry;
    ACTIVITY_CATALOG[producerRefEntry.activityType] = producerRefEntry;
    ACTIVITY_CATALOG[consumerDocEntry.activityType] = consumerDocEntry;
    try {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "Switch with two branches writing same ctx" },
        entryNodeId: "sw",
        ctx: { out: { type: "object" } },
        nodes: {
          sw: {
            id: "sw",
            type: "switch",
            label: "switch",
            cases: [],
            defaultEdge: "eA",
          } as SwitchNode,
          A: {
            id: "A",
            type: "activity",
            label: "Producer A (Document)",
            activityType: "test.produceDoc",
            outputs: [{ port: "out", ctxKey: "out" }],
          } as ActivityNode,
          B: {
            id: "B",
            type: "activity",
            label: "Producer B (Reference)",
            activityType: "test.produceRef",
            outputs: [{ port: "out", ctxKey: "out" }],
          } as ActivityNode,
          C: {
            id: "C",
            type: "activity",
            label: "Consumer C (Document)",
            activityType: "test.consumeDoc",
            inputs: [{ port: "in", ctxKey: "out" }],
          } as ActivityNode,
        },
        edges: [
          { id: "eA", source: "sw", target: "A", type: "normal" },
          { id: "eB", source: "sw", target: "B", type: "normal" },
          { id: "eAC", source: "A", target: "C", type: "normal" },
          { id: "eBC", source: "B", target: "C", type: "normal" },
        ],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

      const mismatchErrors = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatchErrors).toHaveLength(1);
      expect(mismatchErrors[0]).toEqual({
        severity: "error",
        path: "nodes.C.inputs.in",
        message:
          "Input port `in` (Document) on node `C` reads from ctx key `out`, written by node `B` (Reference) — Reference not assignable to Document",
      });
    } finally {
      delete ACTIVITY_CATALOG[producerDocEntry.activityType];
      delete ACTIVITY_CATALOG[producerRefEntry.activityType];
      delete ACTIVITY_CATALOG[consumerDocEntry.activityType];
    }
  });
});

describe("US-093 Scenario 3: kind resolves through all three sources interchangeably", () => {
  it("source (a): producer kind from activity catalog `PortDescriptor.kind` triggers mismatch vs Segment consumer", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    type TestPortKind = "Document" | "Segment";
    interface TestEntryShape {
      activityType: string;
      displayName: string;
      category: string;
      description: string;
      iconHint: string;
      colorHint: string;
      inputs: Array<{ name: string; label: string; kind: TestPortKind }>;
      outputs: Array<{ name: string; label: string; kind: TestPortKind }>;
      parametersSchema: never;
    }
    const writerEntry: TestEntryShape = {
      activityType: "test.s3a.writeDoc",
      displayName: "writer",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [],
      outputs: [{ name: "out", label: "Out", kind: "Document" }],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    const readerEntry: TestEntryShape = {
      activityType: "test.s3a.readSeg",
      displayName: "reader",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [{ name: "in", label: "In", kind: "Segment" }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[writerEntry.activityType] = writerEntry;
    ACTIVITY_CATALOG[readerEntry.activityType] = readerEntry;
    try {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "W",
        ctx: { k: { type: "object" } },
        nodes: {
          W: {
            id: "W",
            type: "activity",
            label: "writer",
            activityType: writerEntry.activityType,
            outputs: [{ port: "out", ctxKey: "k" }],
          } as ActivityNode,
          R: {
            id: "R",
            type: "activity",
            label: "reader",
            activityType: readerEntry.activityType,
            inputs: [{ port: "in", ctxKey: "k" }],
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "W", target: "R", type: "normal" }],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      const mismatch = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].message).toContain("Document not assignable to Segment");

      // Now flip the consumer to expect Document → passes silently
      readerEntry.inputs[0] = { name: "in", label: "In", kind: "Document" };
      const result2 = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      expect(
        result2.errors.filter((e) => e.message.includes("not assignable")),
      ).toEqual([]);
    } finally {
      delete ACTIVITY_CATALOG[writerEntry.activityType];
      delete ACTIVITY_CATALOG[readerEntry.activityType];
    }
  });

  it("source (b): producer kind from CtxDeclaration triggers mismatch vs Segment consumer", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    // Consumer expects Segment via catalog port kind. Producer activity
    // has NO catalog kind, so resolution falls through to the ctx
    // declaration kind = Document → mismatch.
    const consumerEntry = {
      activityType: "test.s3b.readSeg",
      displayName: "reader",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [{ name: "in", label: "In", kind: "Segment" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      // For the test to isolate Document-from-CtxDeclaration as the
      // producer's source, the producer activity must NOT have a catalog
      // kind. We use "noop.activity" which is unregistered in the live
      // catalog and is admitted via ALWAYS_REGISTERED_OPTIONS.
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "W",
        ctx: { k: { type: "object", kind: "Document" } },
        nodes: {
          W: {
            id: "W",
            type: "activity",
            label: "writer",
            activityType: "noop.activity",
            outputs: [{ port: "out", ctxKey: "k" }],
          } as ActivityNode,
          R: {
            id: "R",
            type: "activity",
            label: "reader",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "in", ctxKey: "k" }],
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "W", target: "R", type: "normal" }],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      const mismatch = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].message).toContain("Document not assignable to Segment");

      // Flip CtxDeclaration kind to match the consumer → passes.
      config.ctx.k = { type: "object", kind: "Segment" };
      const result2 = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      expect(
        result2.errors.filter((e) => e.message.includes("not assignable")),
      ).toEqual([]);
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });

  it("source (c): producer kind from LibraryPortDescriptor (library's metadata.inputs[]) triggers mismatch vs Segment consumer", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const consumerEntry = {
      activityType: "test.s3c.readSeg",
      displayName: "reader",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [{ name: "in", label: "In", kind: "Segment" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      // No writer node — the library's `metadata.inputs[]` IS the
      // typed producer surface for an entry-point ctx key. To trigger
      // the binding walk's producer side we need a node that writes the
      // ctx key. The library's input feeds ctx at entry; modelled here as
      // an activity output bound to the entry-point ctx key, whose own
      // kind falls through (no catalog kind, no ctx kind) to the
      // LibraryPortDescriptor.kind via the `metadata.inputs[]` path.
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {
          name: "library",
          kind: "library",
          inputs: [
            {
              label: "input doc",
              path: "ctx.entryDoc",
              type: "object",
              kind: "Document",
            },
          ],
          outputs: [],
        },
        entryNodeId: "entry",
        ctx: { entryDoc: { type: "object" } },
        nodes: {
          entry: {
            id: "entry",
            type: "activity",
            label: "entry",
            activityType: "noop.activity",
            outputs: [{ port: "out", ctxKey: "entryDoc" }],
          } as ActivityNode,
          R: {
            id: "R",
            type: "activity",
            label: "reader",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "in", ctxKey: "entryDoc" }],
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "entry", target: "R", type: "normal" }],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      const mismatch = result.errors.filter((e) =>
        e.message.includes("not assignable"),
      );
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].message).toContain("Document not assignable to Segment");
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });
});

describe("US-093 Scenario 4: missing kind on either side defaults to Artifact wildcard", () => {
  it("untyped producer + typed consumer passes (legacy producer treated as wildcard)", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const consumerEntry = {
      activityType: "test.s4.readSeg",
      displayName: "reader",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [{ name: "in", label: "In", kind: "Segment" as const }],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[consumerEntry.activityType] = consumerEntry;
    try {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "W",
        // Ctx has NO `kind`, producer is `noop.activity` (no catalog kind)
        // → producer kind resolves to undefined → wildcard.
        ctx: { k: { type: "object" } },
        nodes: {
          W: {
            id: "W",
            type: "activity",
            label: "writer",
            activityType: "noop.activity",
            outputs: [{ port: "out", ctxKey: "k" }],
          } as ActivityNode,
          R: {
            id: "R",
            type: "activity",
            label: "reader",
            activityType: consumerEntry.activityType,
            inputs: [{ port: "in", ctxKey: "k" }],
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "W", target: "R", type: "normal" }],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      expect(
        result.errors.filter((e) => e.message.includes("not assignable")),
      ).toEqual([]);
    } finally {
      delete ACTIVITY_CATALOG[consumerEntry.activityType];
    }
  });

  it("typed producer + untyped consumer passes (consumer wildcard accepts anything)", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const writerEntry = {
      activityType: "test.s4b.writeDoc",
      displayName: "writer",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [],
      outputs: [{ name: "out", label: "Out", kind: "Document" as const }],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[writerEntry.activityType] = writerEntry;
    try {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "W",
        ctx: { k: { type: "object" } },
        nodes: {
          W: {
            id: "W",
            type: "activity",
            label: "writer",
            activityType: writerEntry.activityType,
            outputs: [{ port: "out", ctxKey: "k" }],
          } as ActivityNode,
          R: {
            id: "R",
            type: "activity",
            label: "reader",
            activityType: "noop.activity",
            inputs: [{ port: "in", ctxKey: "k" }],
          } as ActivityNode,
        },
        edges: [{ id: "e1", source: "W", target: "R", type: "normal" }],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      expect(
        result.errors.filter((e) => e.message.includes("not assignable")),
      ).toEqual([]);
    } finally {
      delete ACTIVITY_CATALOG[writerEntry.activityType];
    }
  });
});

describe("US-093 Scenario 5: cleanly-typed graph passes", () => {
  it("emits zero kind errors when producer and consumer agree via CtxDeclaration kind", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "Cleanly typed via CtxDeclaration" },
      entryNodeId: "W",
      ctx: { docKey: { type: "object", kind: "Document" } },
      nodes: {
        W: {
          id: "W",
          type: "activity",
          label: "writer",
          activityType: "noop.activity",
          outputs: [{ port: "out", ctxKey: "docKey" }],
        } as ActivityNode,
        R: {
          id: "R",
          type: "activity",
          label: "reader",
          activityType: "noop.activity",
          inputs: [{ port: "in", ctxKey: "docKey" }],
        } as ActivityNode,
      },
      edges: [{ id: "e1", source: "W", target: "R", type: "normal" }],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    expect(result.valid).toBe(true);
    expect(
      result.errors.filter((e) => e.message.includes("not assignable")),
    ).toEqual([]);
  });

  it("emits zero kind errors for a Phase 3 exemplar shape: Segment[] producer → Segment[] consumer via catalog kinds", () => {
    const { ACTIVITY_CATALOG } = require("../catalog");
    const splitEntry = {
      activityType: "test.s5.documentSplit",
      displayName: "Document Split",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [],
      outputs: [
        { name: "segments", label: "Segments", kind: "Segment[]" as const },
      ],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    const classifyEntry = {
      activityType: "test.s5.documentClassify",
      displayName: "Document Classify",
      category: "Document Handling",
      description: "",
      iconHint: "",
      colorHint: "",
      inputs: [
        { name: "segments", label: "Segments", kind: "Segment[]" as const },
      ],
      outputs: [],
      parametersSchema: { _def: {}, parse: () => ({}) } as never,
    };
    ACTIVITY_CATALOG[splitEntry.activityType] = splitEntry;
    ACTIVITY_CATALOG[classifyEntry.activityType] = classifyEntry;
    try {
      const config: GraphWorkflowConfig = {
        schemaVersion: "1.0",
        metadata: { name: "Phase 3 exemplar: split → classify" },
        entryNodeId: "split",
        ctx: { segs: { type: "array" } },
        nodes: {
          split: {
            id: "split",
            type: "activity",
            label: "split",
            activityType: splitEntry.activityType,
            outputs: [{ port: "segments", ctxKey: "segs" }],
          } as ActivityNode,
          classify: {
            id: "classify",
            type: "activity",
            label: "classify",
            activityType: classifyEntry.activityType,
            inputs: [{ port: "segments", ctxKey: "segs" }],
          } as ActivityNode,
        },
        edges: [
          { id: "e1", source: "split", target: "classify", type: "normal" },
        ],
      };

      const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
      expect(result.valid).toBe(true);
      expect(
        result.errors.filter((e) => e.message.includes("not assignable")),
      ).toEqual([]);
    } finally {
      delete ACTIVITY_CATALOG[splitEntry.activityType];
      delete ACTIVITY_CATALOG[classifyEntry.activityType];
    }
  });
});

// ---------------------------------------------------------------------------
// US-094: Library `metadata.inputs[].path` / `metadata.outputs[].path`
//         depth-check
//
// Library workflows must declare paths that actually resolve in their own
// graph — either to a declared ctx key (with optional `ctx.` prefix) or to
// an existing node's bound output port via `nodes.<id>.outputs.<port>`.
//
// The depth check is independent of US-093's kind-mismatch walk: both
// passes run, and they don't share logic.
// ---------------------------------------------------------------------------

describe("US-094 Scenario 1a: library input path resolving to a declared ctx key passes", () => {
  it("emits no path-depth errors when `ctx.documentUrl` is declared", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Library with ctx-anchored input",
        kind: "library",
        inputs: [
          { label: "Document URL", path: "ctx.documentUrl", type: "string" },
        ],
        outputs: [],
      },
      entryNodeId: "noop",
      ctx: { documentUrl: { type: "string" } },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toEqual([]);
  });
});

describe("US-094 Scenario 1b: library output path resolving to an existing node's output passes", () => {
  it("emits no path-depth errors when `nodes.classify.outputs.segmentType` is bound", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Library with node-output path",
        kind: "library",
        inputs: [],
        outputs: [
          {
            label: "Segment Type",
            path: "nodes.classify.outputs.segmentType",
            type: "string",
          },
        ],
      },
      entryNodeId: "classify",
      ctx: { segType: { type: "string" } },
      nodes: {
        classify: {
          id: "classify",
          type: "activity",
          label: "Classify",
          activityType: "noop.activity",
          outputs: [{ port: "segmentType", ctxKey: "segType" }],
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toEqual([]);
  });
});

describe("US-094 Scenario 2: library input path referencing a non-existent ctx key fails", () => {
  it("emits one error anchored to `metadata.inputs[0].path` with the expected message", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Library referencing missing ctx key",
        kind: "library",
        inputs: [
          { label: "Foo", path: "ctx.fooThatDoesntExist", type: "string" },
        ],
        outputs: [],
      },
      entryNodeId: "noop",
      ctx: { someOtherKey: { type: "string" } },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toHaveLength(1);
    expect(depthErrors[0]).toEqual({
      severity: "error",
      path: "metadata.inputs[0].path",
      message:
        "Library input `Foo` path `ctx.fooThatDoesntExist` does not resolve to a declared ctx key or node output in this graph",
    });
    expect(result.valid).toBe(false);
  });
});

describe("US-094 Scenario 3: library output path referencing a missing node id fails", () => {
  it("emits one error anchored to `metadata.outputs[0].path` naming the offending path", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Library output references missing node",
        kind: "library",
        inputs: [],
        outputs: [
          {
            label: "Result",
            path: "nodes.missingNode.outputs.x",
            type: "object",
          },
        ],
      },
      entryNodeId: "noop",
      ctx: { someOtherKey: { type: "string" } },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toHaveLength(1);
    expect(depthErrors[0]).toEqual({
      severity: "error",
      path: "metadata.outputs[0].path",
      message:
        "Library output `Result` path `nodes.missingNode.outputs.x` does not resolve to a declared ctx key or node output in this graph",
    });
    expect(result.valid).toBe(false);
  });

  it("also fails when the node exists but doesn't bind the named output port", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Library output references existing node but missing port",
        kind: "library",
        inputs: [],
        outputs: [
          {
            label: "Result",
            path: "nodes.classify.outputs.notARealPort",
            type: "object",
          },
        ],
      },
      entryNodeId: "classify",
      ctx: { segType: { type: "string" } },
      nodes: {
        classify: {
          id: "classify",
          type: "activity",
          label: "Classify",
          activityType: "noop.activity",
          outputs: [{ port: "segmentType", ctxKey: "segType" }],
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toHaveLength(1);
    expect(depthErrors[0]).toEqual({
      severity: "error",
      path: "metadata.outputs[0].path",
      message:
        "Library output `Result` path `nodes.classify.outputs.notARealPort` does not resolve to a declared ctx key or node output in this graph",
    });
  });
});

describe("US-094 Scenario 4: regression-safe for non-library and empty-inputs cases", () => {
  it("emits no depth errors for a library workflow with empty inputs[] and outputs[]", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Pure-library with empty signature",
        kind: "library",
        inputs: [],
        outputs: [],
      },
      entryNodeId: "noop",
      ctx: {},
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("emits no depth errors for a non-library workflow whose metadata has arbitrary content", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        name: "Regular workflow",
        // No `kind: "library"` set — this is a regular workflow.
        // The depth-check must not fire here even if hypothetical inputs[]
        // were present.
      },
      entryNodeId: "noop",
      ctx: { foo: { type: "string" } },
      nodes: {
        noop: {
          id: "noop",
          type: "activity",
          label: "Noop",
          activityType: "noop.activity",
        } as ActivityNode,
      },
      edges: [],
    };

    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);

    const depthErrors = result.errors.filter((e) =>
      e.message.includes("does not resolve to a declared ctx key or node output"),
    );
    expect(depthErrors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Auto-wire: validator must accept __auto. ctx keys produced by resolveBindings
// ---------------------------------------------------------------------------

import { resolveBindings } from "../auto-wire";

describe("validateGraphConfig + resolveBindings: __auto. ctx keys are accepted", () => {
  it("emits zero errors after resolveBindings auto-wires a two-node activity chain", () => {
    // file.prepare (outputs preparedData: Document)
    //   → azureOcr.submit (inputs fileData: Document)
    // After resolveBindings, both nodes carry __auto. ctx keys that must not
    // trip the "undeclared ctx key" validator check.
    const base: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "A",
      ctx: {},
      nodes: {
        A: {
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          label: "Prepare",
        } as ActivityNode,
        B: {
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          label: "Submit",
        } as ActivityNode,
      },
      edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
    };

    const resolved = resolveBindings(base);
    const result = validateGraphConfig(resolved, ALWAYS_REGISTERED_OPTIONS);

    expect(result.errors).toEqual([]);
  });
});
