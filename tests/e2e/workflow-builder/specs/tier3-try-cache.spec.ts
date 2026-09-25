import * as path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createWorkflow,
  deleteWorkflow,
  type GraphConfig,
  pollNodeStatusesUntilDone,
  startRun,
  uploadToSource,
} from "../helpers/workflow-api";

const SAMPLE_PDF = path.join(
  __dirname,
  "..",
  "fixtures",
  "documents",
  "sample-invoice.pdf",
);

/**
 * Tier 3 (@infra) — incremental cache-hit (Manual test plan 9.6 / 9.9).
 *
 * Try-in-place caches each node's output keyed by (nodeId, configHash,
 * inputHash). Re-running with the SAME inputs serves an unchanged node from
 * cache — reported as `status: "skipped"` with a `cacheHit` hash pair, which
 * the canvas renders as the violet cache-hit badge (that rendering is
 * unit-covered by NodeStatusBadge.test.tsx). This asserts the backend
 * mechanism end-to-end through the real worker + cache.
 *
 * Pure-API (no browser): a same-input re-run isn't cleanly reachable through
 * the source.upload canvas UI (the Run drawer offers an upload box, not a ctx
 * field). @infra: needs the Temporal worker live for the two real runs.
 */
function buildSourcePrepConfig(name = "e2e try-cache"): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: { documentUrl: { type: "string" } },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        metadata: { position: { x: 120, y: 300 } },
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        metadata: { position: { x: 460, y: 300 } },
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

test.describe("try-in-place cache-hit @infra", () => {
  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test(
    "re-running with the same input serves the activity from cache (skipped)",
    { tag: "@infra" },
    async ({ request }, testInfo) => {
      const created = await createWorkflow(request, {
        name: `e2e try-cache ${testInfo.testId}`,
        config: buildSourcePrepConfig(`e2e try-cache ${testInfo.testId}`),
      });
      createdId = created.id;

      // Run 1 — upload kicks off a run that populates the cache. `prep` runs
      // for real (succeeded, not skipped).
      const { runId: run1, blobKey } = await uploadToSource(
        request,
        created.id,
        "upload1",
        SAMPLE_PDF,
      );
      const s1 = await pollNodeStatusesUntilDone(request, created.id, run1, [
        "upload1",
        "prep",
      ]);
      expect(s1.prep.status).toBe("succeeded");

      // Run 2 — same `documentUrl` (same blob key) ⇒ `prep`'s inputHash is
      // unchanged ⇒ it is served from cache: `skipped` with a `cacheHit`.
      const run2 = await startRun(request, created.id, {
        documentUrl: blobKey,
      });
      const s2 = await pollNodeStatusesUntilDone(request, created.id, run2, [
        "upload1",
        "prep",
      ]);
      expect(s2.prep.status).toBe("skipped");
      expect(s2.prep.cacheHit).toBeTruthy();
      expect(typeof s2.prep.cacheHit?.inputHash).toBe("string");
    },
  );
});
