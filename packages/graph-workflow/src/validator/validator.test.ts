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
 */
import type {
  ActivityNode,
  GraphValidationError,
  GraphWorkflowConfig,
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
   * GAP NOTE: the shared validator does NOT currently validate the
   * Temporal-duration grammar of `pollUntil.interval` (or any other
   * duration field). The frontend `PollUntilNodeSettings` form does
   * show an inline error via `apps/frontend/src/features/workflow-
   * builder/settings/control-flow/duration-validation.ts`, but that
   * regex isn't shared into `@ai-di/graph-workflow` and therefore is
   * never surfaced in the validation drawer.
   *
   * Per US-013's technical notes ("If a gap is discovered, raise it as
   * a follow-up; do not patch the validator inside this feature unless
   * trivial") we do NOT patch the validator here. The test below
   * documents the current behaviour so a future fix can flip the
   * expectation in one place.
   */
  it("DOCUMENTS GAP: validator does not currently surface an error for `interval: not-a-duration`", () => {
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
    // Current behaviour: no interval-specific error. This assertion
    // pins that behaviour so the gap is visible. When the follow-up
    // lands, flip to `toHaveLength(1)` and assert the message.
    expect(intervalErrors).toHaveLength(0);
  });
});
