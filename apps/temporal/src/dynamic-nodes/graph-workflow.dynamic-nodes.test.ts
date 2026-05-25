/**
 * Integration tests for the Phase 6 Milestone C (US-171) executor-side
 * dynamic-node dispatch path through `graphWorkflow`.
 *
 * These tests exercise the workflow → `dynamicNode.resolveLineage` →
 * `dyn.run` path end-to-end using Temporal's `TestWorkflowEnvironment`,
 * but with both activities stubbed so the tests don't need Postgres or
 * the live deno-runner. Real-runner integration is covered by
 * `dyn-run.activity.spec.ts` (US-172).
 *
 * Covers Scenario 5: workflow with dyn.* node executes resolve→run; soft-
 * deleted lineage surfaces as DynamicNodeDeletedError-flavored errorMessage;
 * pinned version threads through; head version threads through; head pointer
 * change is picked up by the NEXT execution without restart.
 */

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { computeConfigHash } from "../config-hash";
import { graphWorkflow } from "../graph-workflow";
import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
  GraphWorkflowResult,
} from "../graph-workflow-types";

const TASK_QUEUE = "graph-workflow-dynamic-nodes-test";

interface ResolveCall {
  groupId: string;
  slug: string;
  version?: number;
}

interface DynRunCall {
  slug: string;
  versionId: string;
  parameters: Record<string, unknown>;
  inputCtx: Record<string, unknown>;
  groupId: string;
  workflowRunId: string;
  apiKey: string;
}

function makeDynGraph(
  opts: { pinned?: number; inputCtxKey?: string } = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "Dyn graph", description: "", version: "1.0.0" },
    nodes: {
      a: {
        id: "a",
        type: "activity",
        label: "Dyn",
        activityType: "dyn.my-node",
        dynamicNodeVersion: opts.pinned,
        inputs: opts.inputCtxKey
          ? [{ port: "url", ctxKey: opts.inputCtxKey }]
          : [],
        outputs: [{ port: "uppercased", ctxKey: "result" }],
      },
    },
    edges: [],
    entryNodeId: "a",
    ctx: opts.inputCtxKey
      ? {
          [opts.inputCtxKey]: {
            type: "string",
            defaultValue: "foo.pdf",
          },
          result: { type: "object" },
        }
      : { result: { type: "object" } },
  };
}

function makeInput(graph: GraphWorkflowConfig): GraphWorkflowInput {
  return {
    graph,
    initialCtx: {},
    configHash: computeConfigHash(graph),
    runnerVersion: "1.0.0",
    groupId: "g-test",
    apiKey: "key-test",
  };
}

describe("graphWorkflow — dyn.* dispatch (US-171)", () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  }, 30_000);

  afterAll(async () => {
    if (testEnv) await testEnv.teardown();
  });

  async function runWith(
    input: GraphWorkflowInput,
    resolveFn: (args: ResolveCall) => Promise<{ versionId: string }>,
    dynRunFn: (args: DynRunCall) => Promise<Record<string, unknown>>,
    workflowId: string,
  ): Promise<GraphWorkflowResult> {
    const activities = {
      "dynamicNode.resolveLineage": resolveFn as (
        ...a: unknown[]
      ) => Promise<unknown>,
      "dyn.run": dynRunFn as (...a: unknown[]) => Promise<unknown>,
    };

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: "default",
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve("../graph-workflow"),
      activities,
    });

    return worker.runUntil(
      testEnv.client.workflow.execute(graphWorkflow, {
        workflowId,
        taskQueue: TASK_QUEUE,
        args: [input],
      }),
    );
  }

  it("Scenario 1+4: workflow with dyn.<slug> executes resolve→run; versionId threads to dyn.run", async () => {
    const resolveCalls: ResolveCall[] = [];
    const dynRunCalls: DynRunCall[] = [];

    const resolveFn = async (args: ResolveCall) => {
      resolveCalls.push(args);
      return { versionId: "v-head-1" };
    };
    const dynRunFn = async (args: DynRunCall) => {
      dynRunCalls.push(args);
      return { uppercased: { url: "FOO.PDF" } };
    };

    const result = await runWith(
      makeInput(makeDynGraph()),
      resolveFn,
      dynRunFn,
      "dyn-workflow-head",
    );

    expect(result.status).toBe("completed");
    expect(resolveCalls).toEqual([
      { groupId: "g-test", slug: "my-node", version: undefined },
    ]);
    expect(dynRunCalls).toHaveLength(1);
    expect(dynRunCalls[0].versionId).toBe("v-head-1");
    expect(dynRunCalls[0].apiKey).toBe("key-test");
    expect(dynRunCalls[0].groupId).toBe("g-test");
    expect(result.ctx.result).toEqual({ url: "FOO.PDF" });
  });

  it("Scenario 3: pinned version threads through to dynamicNode.resolveLineage", async () => {
    const resolveCalls: ResolveCall[] = [];
    const resolveFn = async (args: ResolveCall) => {
      resolveCalls.push(args);
      return { versionId: "v-pinned-3" };
    };
    const dynRunFn = async () => ({ uppercased: {} });

    await runWith(
      makeInput(makeDynGraph({ pinned: 3 })),
      resolveFn,
      dynRunFn,
      "dyn-workflow-pinned",
    );

    expect(resolveCalls[0].version).toBe(3);
  });

  it("Scenario 2: soft-deleted lineage surfaces as DynamicNodeDeletedError-flavored errorMessage", async () => {
    const resolveFn = async () => {
      const err = new Error("[DynamicNodeDeletedError] slug=my-node");
      err.name = "DynamicNodeDeletedError";
      throw err;
    };
    const dynRunFn = async () => ({ uppercased: {} });

    // Temporal wraps activity errors; check the failure cause chain carries
    // the DynamicNodeDeletedError prefix the agent's revision loop parses.
    try {
      await runWith(
        makeInput(makeDynGraph()),
        resolveFn,
        dynRunFn,
        "dyn-workflow-deleted",
      );
      throw new Error("expected workflow to fail");
    } catch (err) {
      const serialised = JSON.stringify(err, (_k, v) => {
        if (v instanceof Error) {
          return {
            name: v.name,
            message: v.message,
            cause: (v as Error & { cause?: unknown }).cause,
          };
        }
        return v;
      });
      expect(serialised).toMatch(/DynamicNodeDeletedError/);
    }
  });

  it("Scenario 5: head pointer change is picked up by the NEXT execution (no restart)", async () => {
    let currentHead = "v-head-1";
    const resolveFn = async () => ({ versionId: currentHead });
    const dynRunSeen: string[] = [];
    const dynRunFn = async (args: DynRunCall) => {
      dynRunSeen.push(args.versionId);
      return { uppercased: {} };
    };

    await runWith(
      makeInput(makeDynGraph()),
      resolveFn,
      dynRunFn,
      "dyn-workflow-head-1",
    );

    // Simulate a republish — head pointer moves.
    currentHead = "v-head-2";

    await runWith(
      makeInput(makeDynGraph()),
      resolveFn,
      dynRunFn,
      "dyn-workflow-head-2",
    );

    expect(dynRunSeen).toEqual(["v-head-1", "v-head-2"]);
  });
});
