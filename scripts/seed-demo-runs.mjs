#!/usr/bin/env node
/**
 * Execute REAL Temporal runs against the seeded feature demos, so every
 * run-time surface of the workflow builder has something true behind it.
 *
 * Usage (after `npm run seed:demos`, with the Temporal worker live):
 *   npm run seed:demo-runs
 *
 * ## Why this is a separate command
 *
 * `seed:demos` is HTTP-only against `:3002` — backend and DB up and it works,
 * in a couple of seconds. Folding a run pass into it would quietly give it a
 * **Temporal worker** dependency and turn those seconds into a minute, on
 * every unrelated reseed. So the runs get their own explicit step, invoked
 * when you want the run and replay states.
 *
 * ## Why it executes rather than inserting fixtures
 *
 * There is nothing to insert. `apps/shared/prisma/schema.prisma` has **no run
 * model at all**: `GET /:id/runs` is Temporal's visibility API and
 * `GET /:id/runs/:runId/node-statuses` is a live query against that
 * execution's history. The only DB-backed run artifact is
 * `ActivityOutputCache` — seeding that alone would produce a workflow with
 * preview values, an empty run history and no status badges. The only honest
 * way to get a run is to run one.
 *
 * ## What it produces
 *
 * | State | Where |
 * |---|---|
 * | Succeeded run | try-in-place demo — upload-and-Try over `file.prepare` |
 * | Cache hit (`skipped` + `cacheHit`) | try-in-place demo — same graph, same inputs, second run |
 * | Failed run | try-in-place demo — a blob key that does not resolve |
 * | Taken branch (`selectedEdgeId`) | branch/error demo — the switch reads the prepared file's real `fileType` |
 * | Taken error path (`selectedEdgeId`) | branch/error demo — `errorPolicy: "fallback"` diverts a genuine failure |
 * | In-flight run | human-gate demo — a `humanGate` really waiting |
 * | Cancelled run | human-gate demo — a second Try cancels the first (D-17) |
 * | Run pinned to an older version | replay demo — run at v1 while head is v2 |
 *
 * Nothing here touches Azure, an LLM or any credential: every activity in
 * those graphs (`file.prepare`, `document.updateStatus`) runs against local
 * Postgres and local blob storage.
 *
 * **Expired history is deliberately not produced.** A run only becomes
 * unreplayable once Temporal retention-cleans it, and the dev namespace's
 * retention is 30 days (`DEFAULT_NAMESPACE_RETENTION` in docker-compose.yml).
 * There is no way to age a run on demand, so that state is left to be
 * photographed when it happens naturally.
 *
 * ## It leaves one execution open, on purpose
 *
 * The human-gate demo's newest run is parked on a `humanGate` waiting for a
 * signal that never comes. That is the in-flight state; it is not a hung
 * workflow. Re-running this script cancels it and parks a fresh one, so the
 * count never grows.
 *
 * Env: BACKEND_URL (default http://localhost:3002), FRONTEND_URL
 * (default http://localhost:3000), TEST_API_KEY (probed — see below).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NAME_PREFIX, RUN_DEMOS } from "./demo-run-targets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// API-key resolution, identical to seed-feature-demos.mjs: the backend
// validates `x-api-key` against whatever value the DB was seeded with, which
// may be the shell env, the backend `.env`, or the documented default. Gather
// all three and probe which one authenticates. A key value is never logged.
const DEFAULT_KEY = "69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY";
const SHELL_KEY = process.env.TEST_API_KEY; // captured before loading .env
const BACKEND_ENV = resolve(__dirname, "../apps/backend-services/.env");
try {
  if (existsSync(BACKEND_ENV)) process.loadEnvFile(BACKEND_ENV);
} catch {
  // Older Node without loadEnvFile, or unreadable — rely on the other sources.
}
const CANDIDATE_KEYS = [
  ...new Set(
    [SHELL_KEY, process.env.TEST_API_KEY, DEFAULT_KEY].filter(Boolean),
  ),
];

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3002";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * The file every upload sends. Small (668 bytes), committed, and already the
 * fixture the try-in-place e2e spec uploads — so the demo runs and the tests
 * exercise the same bytes.
 */
const SAMPLE_PDF = resolve(
  __dirname,
  "../tests/e2e/workflow-builder/fixtures/documents/sample-invoice.pdf",
);

/**
 * The failure recipe. A blob key that resolves to nothing makes
 * `file.prepare` throw inside the activity — a real node failure with
 * `startedAt` / `endedAt` / `errorMessage`, not a crash that takes the run
 * down before any node reports.
 */
const MISSING_BLOB_KEY = "does/not/exist.pdf";
const MISSING_DOCUMENT_ID = "00000000-0000-0000-0000-000000000000";

/** Node statuses that mean "this node is finished, whatever the outcome". */
const TERMINAL_NODE_STATUSES = ["succeeded", "failed", "skipped", "cancelled"];

let apiKey = ""; // resolved by resolveApiKey() before any call

const authHeaders = () => ({
  "x-api-key": apiKey,
  "Content-Type": "application/json",
});

async function api(method, path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Return the first candidate key the backend accepts (a cheap authenticated
 * GET that is 200 for a valid key, 401/403 for a bad one). Never logs a key.
 */
async function resolveApiKey() {
  for (const candidate of CANDIDATE_KEYS) {
    const res = await fetch(`${BACKEND_URL}/api/workflows?limit=1`, {
      headers: { "x-api-key": candidate },
    }).catch(() => null);
    if (res && res.status !== 401 && res.status !== 403) return candidate;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listItems(list) {
  if (Array.isArray(list)) return list;
  return list.workflows ?? list.data ?? list.items ?? [];
}

/** Map every seeded demo by its full name, so a demo can be found by title. */
async function loadSeededDemos() {
  const byName = new Map();
  const list = await api("GET", "/api/workflows?limit=200");
  for (const w of listItems(list)) {
    if ((w.name || "").startsWith(NAME_PREFIX)) byName.set(w.name, w);
  }
  return byName;
}

function requireDemo(byName, target) {
  const name = `${NAME_PREFIX}${target.title}`;
  const found = byName.get(name);
  if (!found) {
    throw new Error(
      `Demo not found: "${name}". Run \`npm run seed:demos\` first.`,
    );
  }
  return found;
}

/**
 * `POST /:id/sources/:sourceNodeId/upload` — streams the sample file to blob
 * storage, mints a real `Document` row, and kicks off a Try run over it.
 * That run is a genuine execution of the demo's graph; the returned ctx is
 * what every later `/runs` call on that document replays.
 */
async function uploadToSource(workflowId, sourceNodeId) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([readFileSync(SAMPLE_PDF)], { type: "application/pdf" }),
    "sample-invoice.pdf",
  );
  const res = await fetch(
    `${BACKEND_URL}/api/workflows/${workflowId}/sources/${sourceNodeId}/upload`,
    { method: "POST", headers: { "x-api-key": apiKey }, body: form },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upload to ${sourceNodeId} → ${res.status} ${text}`);
  }
  return JSON.parse(text);
}

/** `POST /:id/runs` — a production run (`RunTrigger = "api"`). */
async function startRun(workflowId, initialCtx, workflowVersionId) {
  const body = { initialCtx };
  if (workflowVersionId) body.workflowVersionId = workflowVersionId;
  const res = await api("POST", `/api/workflows/${workflowId}/runs`, body);
  return res.workflowId;
}

/** `POST /:id/tries` — a canvas Try; cancels the lineage's previous Try. */
async function startTry(workflowId, initialCtx) {
  const res = await api("POST", `/api/workflows/${workflowId}/tries`, {
    initialCtx,
  });
  return res.workflowId;
}

async function getNodeStatuses(workflowId, runId) {
  return api("GET", `/api/workflows/${workflowId}/runs/${runId}/node-statuses`);
}

/**
 * Poll the live node-status query until `nodeIds` have all reached a terminal
 * status. Throws with the last snapshot rather than returning a half-finished
 * one — a seeded state nobody verified is worse than a failed seed.
 */
async function waitForNodes(workflowId, runId, nodeIds, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = {};
  while (Date.now() < deadline) {
    try {
      last = await getNodeStatuses(workflowId, runId);
      const done = nodeIds.every(
        (n) => last[n] && TERMINAL_NODE_STATUSES.includes(last[n].status),
      );
      if (done) return last;
    } catch {
      // The query is only answerable once the execution exists; retry.
    }
    await sleep(750);
  }
  throw new Error(
    `run ${runId}: nodes [${nodeIds.join(", ")}] did not settle within ` +
      `${timeoutMs}ms — last: ${JSON.stringify(last)}`,
  );
}

/** Poll until `nodeId` reports `running` — used for the gate that waits. */
async function waitForNodeRunning(
  workflowId,
  runId,
  nodeId,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;
  let last = {};
  while (Date.now() < deadline) {
    try {
      last = await getNodeStatuses(workflowId, runId);
      if (last[nodeId]?.status === "running") return last;
    } catch {
      // Not queryable yet.
    }
    await sleep(750);
  }
  throw new Error(
    `run ${runId}: node ${nodeId} never reported running within ${timeoutMs}ms` +
      ` — last: ${JSON.stringify(last)}`,
  );
}

/**
 * Poll run history until this run leaves `running`. The run row settles
 * AFTER its nodes do (the node map is the workflow's own query; the row is
 * Temporal's visibility index, which lags), so anything asserting on the
 * run-level status has to wait for it separately.
 */
async function waitForRunStatus(workflowId, runId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const { runs } = await api(
      "GET",
      `/api/workflows/${workflowId}/runs?limit=25`,
    );
    last = runs.find((r) => r.runId === runId);
    if (last && last.status !== "running") return last;
    await sleep(1000);
  }
  throw new Error(
    `run ${runId}: still "running" in run history after ${timeoutMs}ms` +
      ` — last: ${JSON.stringify(last)}`,
  );
}

const editorLink = (wf) =>
  wf.slug
    ? `${FRONTEND_URL}/workflows/by-slug/${wf.slug}/edit`
    : `${FRONTEND_URL}/workflows/${wf.id}/edit`;

/**
 * Try-in-place demo: a green run, a cache-hit re-run, and a failed run.
 *
 * The green run comes from the upload itself (`POST /sources/:id/upload`
 * mints the document and kicks off a Try over it). Re-running the SAME graph
 * with the SAME ctx is what produces the cache hit — `file.prepare` is a
 * cacheable activity, so the second execution's `(configHash, inputHash)`
 * matches the row the first one wrote and the node comes back `skipped`.
 */
async function seedTryPreviewRuns(wf) {
  const target = RUN_DEMOS.tryPreview;
  console.log(`\n▶ ${wf.name}`);

  const upload = await uploadToSource(wf.id, target.sourceNodeId);
  const ctx = {
    [target.ctxKey]: upload[target.ctxKey],
    documentId: upload.documentId,
  };
  const succeeded = await waitForNodes(wf.id, upload.runId, target.nodeIds);
  const succeededRow = await waitForRunStatus(wf.id, upload.runId);
  console.log(
    `  ✓ succeeded run   ${upload.runId} (${succeededRow.status}; ` +
      `prep=${succeeded.prep.status})`,
  );

  const cachedRunId = await startRun(wf.id, ctx);
  const cached = await waitForNodes(wf.id, cachedRunId, target.nodeIds);
  await waitForRunStatus(wf.id, cachedRunId);
  if (cached.prep.status !== "skipped" || !cached.prep.cacheHit) {
    throw new Error(
      `expected a cache hit on the re-run, got ${JSON.stringify(cached.prep)}`,
    );
  }
  console.log(
    `  ✓ cache-hit run   ${cachedRunId} (prep=skipped, ` +
      `inputHash=${cached.prep.cacheHit.inputHash.slice(0, 12)}…)`,
  );

  const failedRunId = await startRun(wf.id, {
    [target.ctxKey]: MISSING_BLOB_KEY,
    documentId: MISSING_DOCUMENT_ID,
  });
  const failed = await waitForNodes(wf.id, failedRunId, target.nodeIds);
  const failedRow = await waitForRunStatus(wf.id, failedRunId);
  if (failed.prep.status !== "failed") {
    throw new Error(
      `expected prep to fail, got ${JSON.stringify(failed.prep)}`,
    );
  }
  console.log(
    `  ✓ failed run      ${failedRunId} (${failedRow.status}; ` +
      `prep="${failed.prep.errorMessage}")`,
  );

  return { ctx, link: editorLink(wf) };
}

/**
 * Branch/error demo: one run down the switch's matched case, one down the
 * error edge. Both runs finish `succeeded` — the second one because
 * `errorPolicy: "fallback"` is a handled failure, which is exactly the state
 * `selectedEdgeId` exists to draw.
 */
async function seedBranchErrorRuns(wf) {
  const target = RUN_DEMOS.branchError;
  console.log(`\n▶ ${wf.name}`);

  const upload = await uploadToSource(wf.id, target.sourceNodeId);
  const branch = await waitForNodes(wf.id, upload.runId, target.successNodeIds);
  await waitForRunStatus(wf.id, upload.runId);
  if (branch.routeByType.selectedEdgeId !== "to-pdf") {
    throw new Error(
      `expected the switch to take "to-pdf", got ` +
        `${JSON.stringify(branch.routeByType)}`,
    );
  }
  console.log(
    `  ✓ branch taken    ${upload.runId} ` +
      `(routeByType → ${branch.routeByType.selectedEdgeId}, markPdf=` +
      `${branch.markPdf.status})`,
  );

  // Same real document, unreadable blob key: `prep` fails for a reason the
  // graph is designed to handle, and the rejection lands on a document row
  // that actually exists.
  const errorRunId = await startRun(wf.id, {
    [target.ctxKey]: MISSING_BLOB_KEY,
    documentId: upload.documentId,
  });
  const errored = await waitForNodes(wf.id, errorRunId, target.errorNodeIds);
  await waitForRunStatus(wf.id, errorRunId);
  if (errored.prep.selectedEdgeId !== "prep-reject") {
    throw new Error(
      `expected the error edge to be taken, got ${JSON.stringify(errored.prep)}`,
    );
  }
  console.log(
    `  ✓ error path      ${errorRunId} ` +
      `(prep=${errored.prep.status} → ${errored.prep.selectedEdgeId}, ` +
      `reject=${errored.reject.status})`,
  );

  return { link: editorLink(wf) };
}

/**
 * Human-gate demo: a run left waiting, and the run it cancelled.
 *
 * The upload kicks off Try A, which parks on the gate. A second Try cancels
 * A server-side (D-17) and parks in its place — so one call produces both the
 * cancelled row and the in-flight one, and neither is simulated.
 */
async function seedHumanGateRuns(wf) {
  const target = RUN_DEMOS.humanGate;
  console.log(`\n▶ ${wf.name}`);

  const upload = await uploadToSource(wf.id, target.sourceNodeId);
  await waitForNodeRunning(wf.id, upload.runId, target.gateNodeId);
  console.log(`  · first Try parked on the gate (${upload.runId})`);

  const ctx = {
    [target.ctxKey]: upload[target.ctxKey],
    documentId: upload.documentId,
  };
  const waitingRunId = await startTry(wf.id, ctx);
  const cancelledRow = await waitForRunStatus(wf.id, upload.runId);
  if (cancelledRow.status !== "cancelled") {
    throw new Error(
      `expected the first Try to be cancelled, got ` +
        `${JSON.stringify(cancelledRow)}`,
    );
  }
  console.log(`  ✓ cancelled run   ${upload.runId} (${cancelledRow.status})`);

  const waiting = await waitForNodeRunning(
    wf.id,
    waitingRunId,
    target.gateNodeId,
  );
  console.log(
    `  ✓ in-flight run   ${waitingRunId} ` +
      `(${target.gateNodeId}=${waiting[target.gateNodeId].status}; left open ` +
      "on purpose)",
  );

  return { link: editorLink(wf), waitingRunId };
}

/**
 * Replay demo: a run executed against v1 while head is v2.
 *
 * `POST /:id/runs` takes an explicit `workflowVersionId`, so no version
 * juggling is needed — the demo is seeded with both versions and the run is
 * simply pinned to the older one.
 */
async function seedReplayVersionRun(wf, ctx) {
  const target = RUN_DEMOS.replayVersions;
  console.log(`\n▶ ${wf.name}`);

  const { versions } = await api("GET", `/api/workflows/${wf.id}/versions`);
  const v1 = versions.find((v) => v.versionNumber === 1);
  if (!v1) {
    throw new Error(
      `expected a v1 on this lineage, got ${JSON.stringify(versions)}`,
    );
  }
  const runId = await startRun(wf.id, ctx, v1.id);
  await waitForNodes(wf.id, runId, target.v1NodeIds);
  const row = await waitForRunStatus(wf.id, runId);
  if (row.versionNumber !== 1) {
    throw new Error(
      `expected the run to be stamped v1, got ${JSON.stringify(row)}`,
    );
  }
  console.log(
    `  ✓ run pinned to v1 ${runId} (versionNumber=${row.versionNumber}, ` +
      `head=v${versions.length})`,
  );

  return { link: editorLink(wf) };
}

async function main() {
  apiKey = await resolveApiKey();
  if (!apiKey) {
    throw new Error(
      `401 — none of the ${CANDIDATE_KEYS.length} candidate API key(s) were ` +
        "accepted by the backend",
    );
  }
  if (!existsSync(SAMPLE_PDF)) {
    throw new Error(`Sample file missing: ${SAMPLE_PDF}`);
  }

  const byName = await loadSeededDemos();
  const tryPreview = requireDemo(byName, RUN_DEMOS.tryPreview);
  const branchError = requireDemo(byName, RUN_DEMOS.branchError);
  const humanGate = requireDemo(byName, RUN_DEMOS.humanGate);
  const replayVersions = requireDemo(byName, RUN_DEMOS.replayVersions);

  console.log("Seeding real runs against the feature demos…");

  const preview = await seedTryPreviewRuns(tryPreview);
  const branch = await seedBranchErrorRuns(branchError);
  const gate = await seedHumanGateRuns(humanGate);
  const replay = await seedReplayVersionRun(replayVersions, preview.ctx);

  console.log("\nOpen these and use the top bar's Run history:");
  for (const [label, link] of [
    ["succeeded / cache hit / failed", preview.link],
    ["taken branch + taken error path", branch.link],
    ["in-flight + cancelled", gate.link],
    ["replay against v1", replay.link],
  ]) {
    console.log(`  ${label.padEnd(32)} ${link}`);
  }

  console.log(
    `\nOne execution is still open ON PURPOSE: ${gate.waitingRunId} is parked` +
      " on the human gate of the waiting-on-a-person demo. That is the" +
      " in-flight state — not a hung workflow. Re-running this script cancels" +
      " it and parks a fresh one.",
  );
  console.log(
    "Re-seeding the demos (`npm run seed:demos`) deletes and recreates the" +
      " workflows, which orphans every run above — re-run this script after" +
      " it. An orphaned waiting run has no lineage left to cancel it, so it" +
      " sits until its 30-day gate timeout; terminate it by hand if it" +
      " bothers you:\n" +
      "  docker exec temporal temporal workflow list --address 127.0.0.1:7233" +
      " --query \"ExecutionStatus='Running'\"",
  );
}

main().catch((err) => {
  console.error("\nSeeding demo runs failed:", err.message);
  if (/Demo not found/i.test(err.message)) {
    console.error(
      "\nThe demo workflows have to exist first:\n  npm run seed:demos",
    );
  } else if (/\b401\b|Invalid API key|Unauthorized/i.test(err.message)) {
    console.error(
      "\nThe backend accepted none of the API keys it tried (shell" +
        " TEST_API_KEY, apps/backend-services/.env TEST_API_KEY, and the" +
        " documented default). Pass the seeded key explicitly:\n" +
        "  TEST_API_KEY=<your-seeded-key> npm run seed:demo-runs",
    );
  } else if (
    /did not settle|never reported running|still "running"/i.test(err.message)
  ) {
    console.error(
      "\nThe runs were accepted but nothing executed them. This script needs" +
        " the Temporal **worker** live (the `dev: all` task /" +
        " `npm run dev:temporal-worker`).",
    );
  } else if (/fetch failed|ECONNREFUSED|connect/i.test(err.message)) {
    console.error(
      `\nCould not reach the backend at ${BACKEND_URL}. Start it (the` +
        " `dev: all` task / `npm run dev:backend`) and retry.",
    );
  }
  process.exit(1);
});
