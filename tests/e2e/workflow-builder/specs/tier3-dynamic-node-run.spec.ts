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
 * Pure-API. @infra — needs the Temporal worker and deno-runner up. The
 * `dyn.run` activity mints a short-lived internal token per invocation (via
 * the shared database) and injects it into the sandbox as AI_DI_API_KEY, so
 * no worker credential needs provisioning; the run is only meaningful
 * against the full local stack, hence excluded from the default run.
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
      // bare "Activity task failed" in node-statuses, so the most likely
      // local-stack failures — deno-runner not running, or the token mint
      // failing against the database — arrive here with no clue attached.
      // Say it.
      expect(
        statuses.dyn.status,
        `dyn node did not succeed: ${JSON.stringify(statuses.dyn)}\n` +
          "Prerequisite: the deno-runner container and the Temporal worker " +
          "must both be up (the worker mints the sandbox token itself via " +
          "the database). A failed mint or an unreachable runner surfaces " +
          "here only as the wrapper message above. " +
          "See docs-md/workflows/MANUAL_TEST_PLAN.md.",
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

  test(
    "a node's script reaches the platform API with the run's token",
    { tag: "@infra" },
    async ({ request }, testInfo) => {
      // The worker hands each invocation a short-lived token as AI_DI_API_KEY,
      // which the script sends as x-internal-token. The script throws unless
      // the API answers 200, so the node succeeding is the proof.
      const name = `e2e-dynrun-api-${Date.now()}`;
      const script = `/**
 * @workflow-node
 * @name ${name}
 * @description Lists its group's workflows through the platform API (run e2e).
 * @inputs {}
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  _ctx: Record<string, never>,
  _params: Record<string, unknown>,
): Promise<{ result: { status: number } }> {
  const base = Deno.env.get("AI_DI_API_BASE_URL") ?? "";
  const group = Deno.env.get("AI_DI_GROUP_ID") ?? "";
  const res = await fetch(base + "/api/workflows?groupId=" + group, {
    headers: { "x-internal-token": Deno.env.get("AI_DI_API_KEY") ?? "" },
  });
  if (res.status !== 200) {
    throw new Error("platform API answered " + res.status);
  }
  return { result: { status: res.status } };
}`;
      const { status, body } = await attemptPublishScript(request, script);
      expect(status, JSON.stringify(body)).toBe(201);
      slug = body.slug as string;

      const created = await createWorkflow(request, {
        name: `e2e dyn-run api ${testInfo.testId}`,
        config: buildDynNodeConfig(
          `e2e dyn-run api ${testInfo.testId}`,
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
      expect(
        statuses.dyn.status,
        `dyn node did not succeed: ${JSON.stringify(statuses.dyn)}\n` +
          "The script could not read the platform API. Locally the sandbox " +
          "runs in Docker, so the worker's AI_DI_API_BASE_URL must reach the " +
          "host's backend from inside the container: " +
          "http://host.docker.internal:3002.",
      ).toBe("succeeded");
    },
  );
});
