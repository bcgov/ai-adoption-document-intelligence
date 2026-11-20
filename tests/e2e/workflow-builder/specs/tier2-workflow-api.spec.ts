import { expect, test } from "@playwright/test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
  getRunSpec,
  getWorkflow,
  listWorkflowVersions,
  revertHead,
  updateWorkflow,
} from "../helpers/workflow-api";

/**
 * Tier 2 — workflow-as-API + versioning contract (Manual test plan 11.3, 12.2).
 *
 * Pure-API (no browser, no Temporal execution): guards the run-spec and
 * version-revert HTTP contracts the canvas and external callers depend on.
 *
 * Scope note: the *run-start* happy path (11.4 / 12.4 — a real Temporal
 * execution) is covered by `tier3-try-infra` (`@infra`); starting a run needs
 * the Temporal server + worker and is intentionally excluded here so these stay
 * deterministic and side-effect-free (no orphan executions). initialCtx
 * schema-violation (400) is not asserted because `deriveInputSchema` only
 * surfaces `source.api` inputs — a plain activity chain has an empty schema, so
 * there's nothing to violate; that path stays unit-covered (`build-run-spec`).
 */

/** A single-activity workflow whose entry label distinguishes versions. */
function singleNodeConfig(name: string, label: string): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      fileName: { type: "string" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label,
        activityType: "file.prepare",
        inputs: [
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        metadata: { position: { x: 120, y: 80 } },
      },
    },
    edges: [],
  };
}

test.describe("workflow-as-API + versioning", () => {
  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("11.3 — run-spec exposes the trigger contract; unknown id 404s", async ({
    request,
  }, testInfo) => {
    const created = await createWorkflow(request, {
      name: `e2e run-spec ${testInfo.testId}`,
      config: singleNodeConfig(`e2e run-spec ${testInfo.testId}`, "Prepare"),
    });
    createdId = created.id;

    const { status, body } = await getRunSpec(request, created.id);
    expect(status).toBe(200);
    // The four always-present fields external callers script against.
    expect(body.triggerUrl).toContain(created.id);
    expect(body.inputSchema.type).toBe("object");
    expect(typeof body.authNotes).toBe("string");
    expect(body.sampleCurl.length).toBeGreaterThan(0);

    // Unknown lineage id → 404.
    const missing = await getRunSpec(request, "does-not-exist-lineage-id");
    expect(missing.status).toBe(404);
  });

  test("12.2 — revert-head restores a prior version's config", async ({
    request,
  }, testInfo) => {
    const name = `e2e revert ${testInfo.testId}`;
    // v1
    const created = await createWorkflow(request, {
      name,
      config: singleNodeConfig(name, "V1 Prepare"),
    });
    createdId = created.id;
    // v2 (distinct config — different node label)
    await updateWorkflow(request, created.id, {
      name,
      config: singleNodeConfig(name, "V2 Prepare"),
    });

    // Two immutable versions, newest-first.
    const versions = await listWorkflowVersions(request, created.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    const v1 = versions.find((v) => v.versionNumber === 1);
    expect(v1).toBeTruthy();

    // Head currently reflects v2.
    const beforeRevert = await getWorkflow(request, created.id);
    expect(beforeRevert.config.nodes.prep.label).toBe("V2 Prepare");

    // Revert head back to v1.
    const revertStatus = await revertHead(
      request,
      created.id,
      (v1 as { id: string }).id,
    );
    expect(revertStatus).toBe(200);

    const afterRevert = await getWorkflow(request, created.id);
    expect(afterRevert.config.nodes.prep.label).toBe("V1 Prepare");

    // Reverting to a version id that isn't in this lineage → 400.
    const foreignStatus = await revertHead(
      request,
      created.id,
      "cxxxxxxxxxxxxxxxxxxxxxxxx",
    );
    expect(foreignStatus).toBe(400);
  });
});
