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
