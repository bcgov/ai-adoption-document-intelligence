import { expect, test } from "@playwright/test";
import {
  attemptPublishScript,
  deleteDynamicNode,
  publishDynamicNode,
} from "../helpers/dynamic-node-api";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
  pollNodeStatusesUntilDone,
  startRun,
} from "../helpers/workflow-api";

/**
 * Tier 3 (@infra) — dynamic-node EXECUTION in a real run (Manual test plan
 * 14.9 / 14.10 run path).
 *
 * Complements `tier3-dynamic-node-security` (publish + sandbox gates) and the
 * live integration test `dyn-run.activity.integration.test.ts` (which asserts
 * the transform's exact output value via `dynRun` directly). Here we drive the
 * full product path: publish over HTTP → reference the node in a workflow →
 * start a Temporal run → observe the node's terminal status.
 *
 * Pure-API. @infra AND needs the worker's `PLATFORM_API_KEY` provisioned — the
 * `dyn.run` activity injects it into the sandbox and fails fast without it
 * ("PLATFORM_API_KEY is not configured on the worker"), so this is excluded
 * from default CI and only meaningful against a fully-configured worker.
 */

/** A single dynamic-node workflow: `dyn.<slug>` as the (only) entry node. */
function buildDynNodeConfig(
  name: string,
  slug: string,
  input: { port: string; ctxKey: string } | null,
): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "dyn",
    ctx: { in: { type: "object" }, out: { type: "object" } },
    nodes: {
      dyn: {
        id: "dyn",
        type: "activity",
        label: "Dynamic",
        activityType: `dyn.${slug}`,
        inputs: input ? [input] : [],
        outputs: [{ port: "result", ctxKey: "out" }],
        metadata: { position: { x: 160, y: 160 } },
      },
    },
    edges: [],
  };
}

test.describe("dynamic-node run @infra", () => {
  let workflowId: string | null = null;
  let slug: string | null = null;

  test.afterEach(async ({ request }) => {
    if (workflowId) {
      await deleteWorkflow(request, workflowId);
      workflowId = null;
    }
    if (slug) {
      await deleteDynamicNode(request, slug);
      slug = null;
    }
  });

  test(
    "a published node executes in a run and the node succeeds",
    { tag: "@infra" },
    async ({ request }, testInfo) => {
      // publishDynamicNode publishes the uppercase-`document.url` node
      // (input port `document`, output port `result`).
      const name = `e2e-dynrun-ok-${Date.now()}`;
      const published = await publishDynamicNode(request, name);
      slug = published.slug;

      const created = await createWorkflow(request, {
        name: `e2e dyn-run ok ${testInfo.testId}`,
        config: buildDynNodeConfig(`e2e dyn-run ok ${testInfo.testId}`, slug, {
          port: "document",
          ctxKey: "in",
        }),
      });
      workflowId = created.id;

      const runId = await startRun(request, created.id, {
        in: { url: "foo.pdf" },
      });
      const statuses = await pollNodeStatusesUntilDone(
        request,
        created.id,
        runId,
        ["dyn"],
      );
      // The hint is not decoration. Temporal reports the activity's cause as a
      // bare "Activity task failed" in node-statuses, so the single most likely
      // reason this test fails on a working tree — a worker with no
      // PLATFORM_API_KEY, where `dyn.run` refuses in ~50ms before it ever
      // reaches the sandbox — arrives here with no clue attached. Say it.
      expect(
        statuses.dyn.status,
        `dyn node did not succeed: ${JSON.stringify(statuses.dyn)}\n` +
          "Prerequisite: the Temporal worker needs PLATFORM_API_KEY set (any " +
          "non-empty value locally, e.g. in $DI_SECRETS_DIR/temporal.env or " +
          "the repo-root .env) and a restart. Without it `dyn.run` throws " +
          "DynamicNodeConfigError, which surfaces here only as the wrapper " +
          "message above. See docs-md/workflows/MANUAL_TEST_PLAN.md.",
      ).toBe("succeeded");
    },
  );

  test(
    "a node that throws surfaces as a failed node with the typed error",
    { tag: "@infra" },
    async ({ request }, testInfo) => {
      const name = `e2e-dynrun-throw-${Date.now()}`;
      const script = `/**
 * @workflow-node
 * @name ${name}
 * @description Throws at runtime (security/run e2e).
 * @inputs {}
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  _ctx: Record<string, never>,
  _params: Record<string, unknown>,
): Promise<{ result: { ok: boolean } }> {
  throw new Error("boom from dyn node");
}`;
      const { status, body } = await attemptPublishScript(request, script);
      expect(status, JSON.stringify(body)).toBe(201);
      slug = body.slug as string;

      const created = await createWorkflow(request, {
        name: `e2e dyn-run throw ${testInfo.testId}`,
        config: buildDynNodeConfig(
          `e2e dyn-run throw ${testInfo.testId}`,
          slug,
          null,
        ),
      });
      workflowId = created.id;

      const runId = await startRun(request, created.id, {});
      const statuses = await pollNodeStatusesUntilDone(
        request,
        created.id,
        runId,
        ["dyn"],
      );
      // The throwing script fails the run: the node ends `failed` with an
      // error surfaced. node-statuses carries the generic activity-failure
      // wrapper ("Activity task failed"); the typed DynamicNodeRuntimeError
      // (with the "boom" stderr tail) is that failure's cause and is asserted
      // by dyn-run.activity.integration.test.ts, not re-derivable here.
      expect(statuses.dyn.status).toBe("failed");
      expect(statuses.dyn.errorMessage).toBeTruthy();
    },
  );
});
