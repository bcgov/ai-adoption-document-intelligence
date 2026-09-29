#!/usr/bin/env node
/**
 * Seed a set of "feature demo" workflows into the local seed group and generate
 * a click-through guide (docs-md/workflows/FEATURE_DEMO_GUIDE.md) with a
 * deep link + instructions for each visual feature of the workflow builder.
 *
 * Why: the full MANUAL_TEST_PLAN.md walks every feature from scratch. This lets
 * you jump straight to a pre-built workflow that already demonstrates one thing.
 *
 * Usage (backend must be running on :3002):
 *   node scripts/seed-feature-demos.mjs
 *
 * It is idempotent: every run deletes the previously-seeded demos (matched by
 * the "🎯 Demo — " name prefix) and recreates them, then rewrites the guide
 * with the fresh workflow ids. Re-run it after a DB reset (`npm run test:db:reset`)
 * to refresh the links.
 *
 * Env: BACKEND_URL (default http://localhost:3002), FRONTEND_URL
 * (default http://localhost:3000), TEST_API_KEY (defaults to the documented
 * local seed key, matching playwright.config.ts).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Names and node ids shared with scripts/seed-demo-runs.mjs — see that module
// for why they don't live in either script.
import { NAME_PREFIX, RUN_DEMOS } from "./demo-run-targets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Materialise auto-wired port bindings BEFORE persisting, exactly as the editor
// (AUTO_WIRE_DESIGN §31 — resolveBindings runs on save) and the agent tools
// (`resolveBindings(normaliseLocks(config))`) do. The seed POSTs raw hand-built
// configs, so without this an input the resolver would auto-bind (e.g.
// `azureOcr.submit`'s `fileData` ← the upstream `file.prepare`) is left UNBOUND
// in the persisted JSON. The editor hides that (it re-resolves on load), but the
// Temporal engine reads `node.inputs` verbatim — an unbound required input
// arrives at the activity as `undefined` and crashes it. Resolving here makes
// the seeded configs identical to what an editor "Save" would persist.
const { resolveBindings, normaliseLocks } = await import("@ai-di/graph-workflow");

// Load the backend .env so we authenticate with the SAME key the DB was seeded
// with: `seed.ts` (`prisma db seed`) reads `TEST_API_KEY` from this file via
// `dotenv/config`, and the backend validates `x-api-key` against that seeded
// value. Without this the hardcoded fallback only works when the DB happened to
// be seeded with the default key. Mirrors playwright.config.ts. (`loadEnvFile`
// does not overwrite an already-set shell var, matching dotenv semantics.)
// The backend validates `x-api-key` against the value the DB was seeded with,
// which — depending on how `prisma db seed` ran — may be the shell env, the
// backend .env's `TEST_API_KEY`, or the documented default. Rather than guess,
// we gather all three and probe which one the running backend accepts.
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
const GROUP_ID = "seeddefaultgroup";
// Agent chat-log demos: transcripts captured from real live agent runs
// (Azure gpt-5.4), seeded as ChatConversation + ChatMessage rows so the
// FEATURE_DEMO_GUIDE `?agentChat=<id>` links replay them. Fixture workflow
// names carry NAME_PREFIX so deleteExistingDemos() sweeps them too.
const AGENT_DEMO_FIXTURES = ["scenario-1.json"];
const GUIDE_PATH = resolve(
  __dirname,
  "../docs-md/workflows/FEATURE_DEMO_GUIDE.md",
);

let apiKey = ""; // resolved by resolveApiKey() before any write
const authHeaders = () => ({
  "x-api-key": apiKey,
  "Content-Type": "application/json",
});
// Port-row cards (one row per typed port) render up to ~522px wide, but the
// demos below were hand-placed on a ~300–380px column grid tuned for the old
// narrow cards — so wide cards overlap their right-hand neighbour on LOAD
// (Auto-arrange re-lays them out fine; the seeded positions are the problem).
// Widen the horizontal pitch (X only — vertical spacing already clears) so
// seeded layouts match the ~562px rank spacing the Auto-arrange pass uses.
// See apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts
// (DEFAULT_NODE_WIDTH) for the card-width calibration this tracks.
const X_PITCH_SCALE = 1.9;
const pos = (x, y) => ({
  metadata: { position: { x: Math.round(x * X_PITCH_SCALE), y } },
});

/**
 * Stamp the presentation-only `metadata.arrangeOnLoad` hint so the visual
 * editor runs its measured-width Auto-arrange once when the demo is opened —
 * the demo lands in the tidy arranged view without the viewer clicking the
 * button. The hand-placed `pos()` coordinates above remain as the pre-measure
 * placeholder shown for the first frame before the arrange settles. The engine
 * ignores this field (it's not part of config semantics); see
 * apps/frontend/src/features/workflow-builder/arrange-on-load.ts.
 */
const withArrangeOnLoad = (config) => {
  // Resolve auto-wire bindings first (see the import note above), then stamp the
  // arrange-on-load hint. `normaliseLocks` → `resolveBindings` is the canonical
  // editor/agent sequence.
  const resolved = resolveBindings(normaliseLocks(config));
  return {
    ...resolved,
    metadata: { ...(resolved.metadata ?? {}), arrangeOnLoad: true },
  };
};

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

// ---------------------------------------------------------------------------
// Config builders — mirror the shapes the e2e specs build (known-valid).
// ---------------------------------------------------------------------------

function typedChainConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" }, documentId: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
        ...pos(80, 120),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        ...pos(400, 120),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract",
        activityType: "azureOcr.extract",
        ...pos(720, 120),
      },
      clean: {
        id: "clean",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        ...pos(1040, 120),
      },
    },
    edges: [
      { id: "e1", source: "prep", target: "submit", type: "normal" },
      { id: "e2", source: "submit", target: "extract", type: "normal" },
      { id: "e3", source: "extract", target: "clean", type: "normal" },
    ],
  };
}

function autoWireConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: { blobKey: { type: "string" }, documentId: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
        ...pos(80, 120),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit OCR (auto-bound)",
        activityType: "azureOcr.submit",
        ...pos(420, 120),
      },
      lone: {
        id: "lone",
        type: "activity",
        label: "Lone Submit (unsatisfied)",
        activityType: "azureOcr.submit",
        ...pos(420, 360),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "submit", type: "normal" }],
  };
}

function ambiguousConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prepA",
    ctx: { blobKey: { type: "string" }, documentId: { type: "string" } },
    nodes: {
      prepA: {
        id: "prepA",
        type: "activity",
        label: "Prepare A",
        activityType: "file.prepare",
        // documentId bound too — an unbound identifier port now also counts
        // as a problem (Phase 3 amber-ring reconciliation), and the only
        // issue this demo means to show is the sink's ambiguous input.
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
        ...pos(80, 80),
      },
      prepB: {
        id: "prepB",
        type: "activity",
        label: "Prepare B",
        activityType: "file.prepare",
        // A SECOND PreparedFile producer. `azureOcr.submit`'s `fileData` only
        // accepts PreparedFile, so after the kind-taxonomy refinement a
        // DocumentRef producer (e.g. normalizeOrientation's blob key) is
        // correctly NOT a competing source — genuine ambiguity needs two
        // producers of the same kind. Both required inputs bound so prepB's
        // only surfaced issue is the reachability warning (second root).
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
        ...pos(80, 320),
      },
      sink: {
        id: "sink",
        type: "activity",
        label: "Submit OCR (ambiguous)",
        activityType: "azureOcr.submit",
        ...pos(460, 200),
      },
    },
    edges: [
      { id: "a", source: "prepA", target: "sink", type: "normal" },
      { id: "b", source: "prepB", target: "sink", type: "normal" },
    ],
  };
}

function linearConfig(name, submitLabel = "Submit to Azure OCR") {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      fileName: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
      apimRequestId: { type: "string" },
      ocrResult: { type: "object" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(120, 80),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: submitLabel,
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(420, 80),
      },
      // Real OcrResult producer: extract turns the submitted OCR job into an
      // `ocrResult` (kind OcrResult). Without it, `store` below would "store"
      // an OCR result that no node ever produced.
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract OCR Result",
        activityType: "azureOcr.extract",
        inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(720, 80),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        // Both required inputs bound to their honest sources — the document's
        // own id and the real OcrResult produced by `extract` (not, as before,
        // the APIM request id mislabelled as a document id).
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "ocrResult", ctxKey: "ocrResult" },
        ],
        ...pos(1020, 80),
      },
    },
    edges: [
      { id: "prep-submit", source: "prep", target: "submit", type: "normal" },
      {
        id: "submit-extract",
        source: "submit",
        target: "extract",
        type: "normal",
      },
      { id: "extract-store", source: "extract", target: "store", type: "normal" },
    ],
  };
}

function validationWarningConfig(name) {
  const config = linearConfig(name);
  // An orphan node with no incoming edge → reachability WARNING (not an error,
  // so the create endpoint still accepts it).
  config.nodes.orphan = {
    id: "orphan",
    type: "activity",
    label: "Orphan (unreachable)",
    activityType: "file.prepare",
    // documentId bound too — otherwise the unbound identifier port would add
    // a second problems-badge warning on top of the reachability warning
    // this demo means to show, and the guide's "1 warning" step would be
    // wrong.
    inputs: [
      { port: "documentId", ctxKey: "documentId" },
      { port: "blobKey", ctxKey: "blobKey" },
      { port: "fileName", ctxKey: "fileName" },
    ],
    ...pos(420, 340),
  };
  return config;
}

function sourcePrepConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: { documentUrl: { type: "string" }, documentId: { type: "string" } },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(120, 300),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        // documentId bound to a declared ctx var — the upload endpoint
        // injects the real value into initialCtx.documentId at run time
        // regardless of this binding; the binding itself only keeps the
        // canvas warning-clean (Phase 3 amber-ring reconciliation).
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        ...pos(460, 300),
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Runnable run-state demos (Part 9 run-time).
//
// The control-flow demo (`controlFlowConfig`) and the edges demo
// (`edgesValidateConfig`) both contain a switch and an error edge — but they
// are FORMS showcases: the control-flow graph has deliberate dead-ends, and
// the edges graph routes through `azureOcr.submit`, which needs Azure
// credentials. Neither can produce a run, so neither can ever show what a
// taken branch or a taken error edge LOOKS like.
//
// These three graphs exist to be executed. Every node in them is an activity
// that runs against local Postgres + local blob storage — `file.prepare`,
// `document.updateStatus`, `document.storeRejection` — so `npm run
// seed:demo-runs` can drive real Temporal executions through them with no
// Azure, no LLM and no credential. They are ordinary demos in their own right
// (open one and the canvas shows the shape); the runs are the separate,
// opt-in second step.
// ---------------------------------------------------------------------------

/**
 * `source.upload → file.prepare → switch` with a red error edge off the
 * prepare step. One graph, two very different runs:
 *
 *   - a real file → `prep` succeeds → the switch reads `preparedData.fileType`
 *     (a value the prepare step actually computed) and routes down the **pdf**
 *     case, so `selectedEdgeId` marks `to-pdf` as the taken edge;
 *   - an unreadable blob key → `prep` fails → `errorPolicy.onError:
 *     "fallback"` diverts the run down the **error** edge to *Mark rejected*,
 *     which really writes `failed` onto the document row.
 *
 * `retry.maximumAttempts: 1` is deliberate: the default is 3, and a failure
 * demo that takes three activity attempts to land spends ~3s looking hung.
 *
 * The obvious handler for the error edge would be `document.storeRejection`
 * (the edges-and-validateFields demo uses it). It cannot run: the activity
 * upserts a `DocumentRejection` model that was never added to the Prisma
 * schema, so every execution dies with "Cannot read properties of undefined
 * (reading 'upsert')". `document.updateStatus` is the honest substitute here.
 *
 * Every `status` below is a real `DocumentStatus` enum member
 * (apps/shared/prisma/schema.prisma) — the catalog's suggestion list offers
 * `pending` / `completed` / `rejected`, none of which the database accepts.
 */
function runBranchErrorConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: {
      documentUrl: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
    },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(80, 260),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare file",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        retry: { maximumAttempts: 1 },
        errorPolicy: {
          onError: "fallback",
          fallbackEdgeId: "prep-reject",
          retryable: false,
        },
        ...pos(400, 260),
      },
      reject: {
        id: "reject",
        type: "activity",
        label: "Mark rejected",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
        parameters: { status: "failed" },
        ...pos(760, 480),
      },
      routeByType: {
        id: "routeByType",
        type: "switch",
        label: "Route by file type",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.preparedFileData.fileType" },
              right: { literal: "pdf" },
            },
            edgeId: "to-pdf",
          },
        ],
        defaultEdge: "to-image",
        ...pos(760, 260),
      },
      markPdf: {
        id: "markPdf",
        type: "activity",
        label: "Mark as PDF work",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
        parameters: { status: "ongoing_ocr" },
        ...pos(1120, 160),
      },
      markImage: {
        id: "markImage",
        type: "activity",
        label: "Mark as image work",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
        parameters: { status: "pre_ocr" },
        ...pos(1120, 360),
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
      { id: "prep-reject", source: "prep", target: "reject", type: "error" },
      {
        id: "prep-route",
        source: "prep",
        target: "routeByType",
        type: "normal",
      },
      {
        id: "to-pdf",
        source: "routeByType",
        target: "markPdf",
        type: "conditional",
        condition: "file type is pdf",
      },
      {
        id: "to-image",
        source: "routeByType",
        target: "markImage",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

/**
 * `source.upload → file.prepare → humanGate → document.updateStatus`.
 *
 * The gate waits 30 days for a `humanApproval` signal that the seeder never
 * sends, which is the point: a finished run can never show `running` node
 * badges or an un-started downstream step, so the only honest way to
 * photograph an in-flight run is to leave one genuinely in flight.
 */
function runHumanGateConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: {
      documentUrl: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
    },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(80, 260),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare file",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(400, 260),
      },
      approve: {
        id: "approve",
        type: "humanGate",
        label: "Wait for approval",
        signal: {
          name: "humanApproval",
          payloadSchema: { approved: "boolean", reviewer: "string" },
        },
        // 30 days — the dev namespace's retention window, so the waiting run
        // outlives the history that would let you look at it.
        timeout: "720h",
        onTimeout: "fail",
        ...pos(760, 260),
      },
      complete: {
        id: "complete",
        type: "activity",
        label: "Mark complete",
        activityType: "document.updateStatus",
        inputs: [{ port: "documentId", ctxKey: "documentId" }],
        parameters: { status: "complete" },
        ...pos(1120, 260),
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
      { id: "prep-approve", source: "prep", target: "approve", type: "normal" },
      {
        id: "approve-complete",
        source: "approve",
        target: "complete",
        type: "normal",
      },
    ],
  };
}

/**
 * v1 of the replay demo — the graph the seeded run executes against.
 * `runReplayVersionsV2Config` adds a step after it, so head and the run's
 * pinned version genuinely differ and the replay banner has something true to
 * say.
 */
function runReplayVersionsV1Config(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: {
      documentUrl: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
    },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(80, 260),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare file",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(400, 260),
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

/** v2 — v1 plus a *Mark as processing* step that the v1 run never saw. */
function runReplayVersionsV2Config(name) {
  const config = runReplayVersionsV1Config(name);
  config.nodes.markProcessing = {
    id: "markProcessing",
    type: "activity",
    label: "Mark as processing (added in v2)",
    activityType: "document.updateStatus",
    inputs: [{ port: "documentId", ctxKey: "documentId" }],
    parameters: { status: "ongoing_ocr" },
    ...pos(760, 260),
  };
  config.edges.push({
    id: "prep-mark",
    source: "prep",
    target: "markProcessing",
    type: "normal",
  });
  return config;
}

/**
 * One valid graph containing every control-flow node type (Part 4) plus a
 * deeply-nested switch condition (4.7) so each hand-rolled settings form and
 * the recursive condition editor can be inspected from a single workflow.
 */
function controlFlowConfig(name) {
  const inlineChild = {
    schemaVersion: "1.0",
    metadata: { name: "Inline child" },
    entryNodeId: "c1",
    ctx: { blobKey: { type: "string" }, documentId: { type: "string" } },
    nodes: {
      c1: {
        id: "c1",
        type: "activity",
        label: "Prepare (inline)",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
      },
    },
    edges: [],
  };
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "eachDoc",
    ctx: {
      documents: { type: "array" },
      currentDoc: { type: "object" },
      // The map's loop index (0,1,2…). Declared here so the map form's
      // "index ctx key" field doesn't prompt "+ Create variable docIndex"
      // (the map provides the value at run time; declaring it just keeps the
      // form clean, mirroring how currentDoc is declared).
      docIndex: { type: "number" },
      documentId: { type: "string" },
      apimRequestId: { type: "string" },
      // Real Azure OCR poll outputs — the pollUntil condition reads ocrStatus.
      ocrStatus: { type: "string" },
      ocrResponse: { type: "object" },
      // Produced by the azureOcr.extract node (kind OcrResult from the
      // catalog), so the variable picker can drill into ocrResult.* fields.
      ocrResult: { type: "object" },
      results: { type: "array" },
    },
    nodes: {
      eachDoc: {
        id: "eachDoc",
        type: "map",
        label: "Run for each document",
        collectionCtxKey: "documents",
        itemCtxKey: "currentDoc",
        indexCtxKey: "docIndex",
        maxConcurrency: 5,
        bodyEntryNodeId: "routeByType",
        bodyExitNodeId: "extractOcr",
        ...pos(120, 80),
      },
      routeByType: {
        id: "routeByType",
        type: "switch",
        label: "Branch by condition",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.currentDoc.type" },
              right: { literal: "invoice" },
            },
            edgeId: "route-invoice",
          },
          {
            // A 3-level nested expression to exercise the recursive editor:
            // AND( OR( EQ, GTE ), NOT( IS-NULL ) ).
            condition: {
              operator: "and",
              operands: [
                {
                  operator: "or",
                  operands: [
                    {
                      operator: "equals",
                      left: { ref: "ctx.currentDoc.type" },
                      right: { literal: "receipt" },
                    },
                    {
                      operator: "gte",
                      left: { ref: "ctx.currentDoc.confidence" },
                      right: { literal: 0.8 },
                    },
                  ],
                },
                {
                  operator: "not",
                  operand: {
                    operator: "is-null",
                    value: { ref: "ctx.currentDoc.blobKey" },
                  },
                },
              ],
            },
            edgeId: "route-receipt",
          },
        ],
        defaultEdge: "route-default",
        ...pos(120, 320),
      },
      childOcr: {
        id: "childOcr",
        type: "childWorkflow",
        label: "Sub-workflow (inline OCR)",
        workflowRef: { type: "inline", graph: inlineChild },
        inputMappings: [{ port: "blobKey", ctxKey: "currentDoc.blobKey" }],
        // No outputMappings: this branch is a teaching stub for the
        // childWorkflow FORM (Library/Inline toggle + input mapping); it
        // deliberately dead-ends rather than mapping an output nothing reads.
        ...pos(460, 200),
      },
      pollOcr: {
        id: "pollOcr",
        type: "pollUntil",
        label: "Wait until condition",
        activityType: "azureOcr.poll",
        condition: {
          operator: "not-equals",
          left: { ref: "ctx.ocrStatus" },
          right: { literal: "running" },
        },
        interval: "10s",
        maxAttempts: 20,
        initialDelay: "5s",
        timeout: "10m",
        // Bind the poll activity's required input so the node doesn't carry
        // a red "unsatisfied" dot in a demo about control-flow forms.
        inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        // Bind the poll's real outputs — the condition polls ocrStatus, and
        // ocrResponse feeds the downstream extract node.
        outputs: [
          { port: "status", ctxKey: "ocrStatus" },
          { port: "ocrResponse", ctxKey: "ocrResponse" },
        ],
        ...pos(460, 360),
      },
      // Real OcrResult producer: consumes the poll's apimRequestId +
      // ocrResponse and emits ocrResult (kind "OcrResult" from the catalog).
      // This is the map body's exit node.
      extractOcr: {
        id: "extractOcr",
        type: "activity",
        label: "Extract OCR result",
        activityType: "azureOcr.extract",
        inputs: [
          { port: "apimRequestId", ctxKey: "apimRequestId" },
          { port: "ocrResponse", ctxKey: "ocrResponse" },
        ],
        outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(460, 680),
      },
      approve: {
        id: "approve",
        type: "humanGate",
        label: "Wait for approval",
        signal: {
          name: "humanApproval",
          payloadSchema: { approved: "boolean", reviewer: "string" },
        },
        timeout: "24h",
        onTimeout: "fail",
        ...pos(970, 80),
      },
      collect: {
        id: "collect",
        type: "join",
        label: "Collect results",
        sourceMapNodeId: "eachDoc",
        strategy: "all",
        resultsCtxKey: "results",
        ...pos(820, 80),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "ocrResult", ctxKey: "ocrResult" },
        ],
        ...pos(1120, 80),
      },
    },
    edges: [
      { id: "map-join", source: "eachDoc", target: "collect", type: "normal" },
      // G-070: the human gate sits AFTER the join, outside the loop body. A
      // gate inside a map body cannot work — every item would register the
      // same signal name and an approval has no way to say which item it is
      // for — and the validator now refuses it, so the demo must model the
      // shape that actually runs: approve the collected batch, then store.
      {
        id: "join-approve",
        source: "collect",
        target: "approve",
        type: "normal",
      },
      { id: "approve-store", source: "approve", target: "store", type: "normal" },
      {
        id: "route-invoice",
        source: "routeByType",
        target: "childOcr",
        type: "conditional",
        condition: "invoice",
      },
      {
        id: "route-receipt",
        source: "routeByType",
        target: "pollOcr",
        type: "conditional",
        condition: "receipt",
      },
      // Receipt path continues poll → extract (the map body's exit node).
      {
        id: "poll-extract",
        source: "pollOcr",
        target: "extractOcr",
        type: "normal",
      },
      // Unrecognised type: skip the per-item OCR work and fall through to the
      // body's exit node.
      {
        id: "route-default",
        source: "routeByType",
        target: "extractOcr",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

/**
 * A switch (conditional edges) + a node with a red error edge (5.2) + a
 * `document.validateFields` node carrying the three rich rule shapes (5.3).
 */
function edgesValidateConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      fileName: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
      apimRequestId: { type: "string" },
      ocrResult: { type: "object" },
      averageConfidence: { type: "number" },
      requiresReview: { type: "boolean" },
      rejectionReason: { type: "string" },
      // The one honest trigger-supplied input: producing real Segments needs
      // the whole split/classify/combine chain, out of scope for this demo,
      // so `processedSegments` arrives from the run's trigger input.
      processedSegments: { type: "array" },
      validationResults: { type: "object" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        // Opt into an error edge (5.2): fall back to a handler on failure.
        errorPolicy: {
          onError: "fallback",
          fallbackEdgeId: "prep-fallback",
          retryable: false,
        },
        ...pos(120, 120),
      },
      fallback: {
        id: "fallback",
        type: "activity",
        label: "Reject document",
        // A real failure handler: record why the document was rejected. (The
        // old fallback ran `ocr.cleanup` on an OcrResult that nothing upstream
        // produced — nonsensical for a *file-prepare* failure.)
        activityType: "document.storeRejection",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "reason", ctxKey: "rejectionReason" },
        ],
        ...pos(120, 360),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit to Azure OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(460, 120),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract OCR Result",
        activityType: "azureOcr.extract",
        inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(800, 120),
      },
      checkConfidence: {
        id: "checkConfidence",
        type: "activity",
        label: "Check Confidence",
        // Real producer of `requiresReview` — so the switch below routes on a
        // value a node actually computes, not a phantom ctx key.
        activityType: "ocr.checkConfidence",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "ocrResult", ctxKey: "ocrResult" },
        ],
        outputs: [
          { port: "requiresReview", ctxKey: "requiresReview" },
          { port: "averageConfidence", ctxKey: "averageConfidence" },
        ],
        ...pos(1140, 120),
      },
      reviewSwitch: {
        id: "reviewSwitch",
        type: "switch",
        label: "Route by review flag",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.requiresReview" },
              right: { literal: true },
            },
            edgeId: "to-validate",
          },
        ],
        defaultEdge: "to-store",
        ...pos(1480, 120),
      },
      validateFields: {
        id: "validateFields",
        type: "activity",
        label: "Validate Fields",
        activityType: "document.validateFields",
        inputs: [
          { port: "processedSegments", ctxKey: "processedSegments" },
          { port: "documentId", ctxKey: "documentId" },
        ],
        outputs: [{ port: "validationResults", ctxKey: "validationResults" }],
        parameters: {
          rules: [
            {
              name: "pay-stub-arithmetic",
              type: "arithmetic",
              expression: {
                operation: "difference",
                fields: ["page2.grossPay", "page2.totalDeductions"],
                equals: "page2.netPay",
              },
              operator: "approximately",
              tolerance: { amount: 0.05 },
              fieldType: "currency",
            },
            {
              name: "gross-pay-match",
              type: "field-match",
              primaryField: "page1.grossPay",
              attachmentField: "page2.grossPay",
              operator: "approximately",
              tolerance: { amount: 0.05 },
              fieldType: "currency",
            },
            {
              name: "deposits-match",
              type: "array-match",
              primaryFields: ["page1.netPay"],
              attachmentFields: ["page3.amount"],
              matchType: "all",
              operator: "approximately",
              tolerance: { amount: 0.05 },
              fieldType: "currency",
            },
          ],
        },
        ...pos(1820, 40),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "ocrResult", ctxKey: "ocrResult" },
        ],
        ...pos(1820, 260),
      },
    },
    edges: [
      { id: "prep-submit", source: "prep", target: "submit", type: "normal" },
      {
        id: "prep-fallback",
        source: "prep",
        target: "fallback",
        type: "error",
      },
      {
        id: "submit-extract",
        source: "submit",
        target: "extract",
        type: "normal",
      },
      {
        id: "extract-check",
        source: "extract",
        target: "checkConfidence",
        type: "normal",
      },
      {
        id: "check-switch",
        source: "checkConfidence",
        target: "reviewSwitch",
        type: "normal",
      },
      {
        id: "to-validate",
        source: "reviewSwitch",
        target: "validateFields",
        type: "conditional",
        condition: "requiresReview",
      },
      {
        id: "to-store",
        source: "reviewSwitch",
        target: "store",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

/**
 * A `source.upload → file.prepare (prep) → switch (routeByPrepared)` graph that
 * showcases the Phase-5 "conditions from node outputs" step picker (Part 4,
 * 4.8–4.12). The switch's single case condition is an `is-not-null` on the
 * producer's ctx key, and `prep` carries the MATCHING output binding, so opening
 * the case condition resolves to the "Prepare file → Prepared file data" caption
 * on load (not a raw ctx key).
 *
 * The invariant `resolveCtxKeyToProducer` needs (see
 * frontend graph-widgets/condition-producer-binding.ts):
 *   1. `prep.outputs` binds `preparedData` → `__auto.prep.preparedData`.
 *   2. The switch case condition's ValueRef `ref` equals that exact ctx key.
 *   3. `prep` is upstream of the switch (the `prep-switch` edge).
 * `__auto.*` keys are resolver-internal, so the validator does not require them
 * in `ctx` (getRefCtxRootKey returns undefined for the `__auto` namespace).
 */
function conditionStepRefConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: {
      documentUrl: { type: "string" },
      documentId: { type: "string" },
      rejectionReason: { type: "string" },
    },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(120, 300),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare file",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        // KEY invariant #1: the producer's output binding whose ctxKey the
        // switch case condition references below — this is what makes the
        // step-picker resolve "Prepare file → Prepared file data" on load.
        outputs: [{ port: "preparedData", ctxKey: "__auto.prep.preparedData" }],
        ...pos(460, 300),
      },
      routeByPrepared: {
        id: "routeByPrepared",
        type: "switch",
        label: "Route by prepared data",
        cases: [
          {
            // KEY invariant #2: ref === prep's preparedData output ctxKey.
            condition: {
              operator: "is-not-null",
              value: { ref: "__auto.prep.preparedData" },
            },
            edgeId: "route-ready",
          },
        ],
        defaultEdge: "route-default",
        ...pos(820, 300),
      },
      whenReady: {
        id: "whenReady",
        type: "activity",
        label: "Submit to OCR",
        // The "ready" branch genuinely consumes the prepared file: its
        // `fileData` (Prepared file) auto-binds to `prep`'s `preparedData`
        // output upstream — reinforcing the demo's own story (the condition
        // points at the prepared data; the ready branch uses it).
        activityType: "azureOcr.submit",
        ...pos(1160, 160),
      },
      whenMissing: {
        id: "whenMissing",
        type: "activity",
        label: "Reject document (default)",
        // The default branch records a rejection reason — a real handler for
        // "prepared data missing", instead of the old `ocr.storeResults` that
        // read an OcrResult nothing produced.
        activityType: "document.storeRejection",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "reason", ctxKey: "rejectionReason" },
        ],
        ...pos(1160, 460),
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
      // KEY invariant #3: prep is upstream of the switch.
      {
        id: "prep-switch",
        source: "prep",
        target: "routeByPrepared",
        type: "normal",
      },
      {
        id: "route-ready",
        source: "routeByPrepared",
        target: "whenReady",
        type: "conditional",
        condition: "ready",
      },
      {
        id: "route-default",
        source: "routeByPrepared",
        target: "whenMissing",
        type: "conditional",
        condition: "default",
      },
    ],
  };
}

/**
 * A real OCR chain pre-organised into two groups, so grouping (6.2), exposed
 * params (6.4), simplified view (6.3), node-type swap (6.6) and auto-arrange
 * (6.7) can all be exercised from one workflow. The OCR Extraction group
 * exposes one parameter that a member node genuinely consumes (`prep`'s
 * `modelId`) — the exposed-param editor edits `nodes.prep.parameters.modelId`,
 * not a decorative ctx default nothing reads.
 */
function groupingConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      fileName: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
      apimRequestId: { type: "string" },
      ocrResult: { type: "object" },
      cleanedResult: { type: "object" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        // A real node parameter — the OCR model that rides inside the prepared
        // file. This is what the "OCR Model" exposed param below edits.
        parameters: { modelId: "prebuilt-layout" },
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(120, 80),
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit to Azure OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(420, 80),
      },
      extract: {
        id: "extract",
        type: "activity",
        label: "Extract OCR Result",
        activityType: "azureOcr.extract",
        inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        outputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(720, 80),
      },
      cleanup: {
        id: "cleanup",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        outputs: [{ port: "cleanedResult", ctxKey: "cleanedResult" }],
        ...pos(1020, 80),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        // The document's own id + the CLEANED OcrResult — an honest end of the
        // chain (was: documentId mislabelled onto the APIM request id).
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "ocrResult", ctxKey: "cleanedResult" },
        ],
        ...pos(1320, 80),
      },
    },
    edges: [
      { id: "e1", source: "prep", target: "submit", type: "normal" },
      { id: "e2", source: "submit", target: "extract", type: "normal" },
      { id: "e3", source: "extract", target: "cleanup", type: "normal" },
      { id: "e4", source: "cleanup", target: "store", type: "normal" },
    ],
    nodeGroups: {
      ocr: {
        label: "OCR Extraction",
        description: "Prepare the file and submit it to Azure OCR.",
        icon: "scan",
        color: "#3b82f6",
        nodeIds: ["prep", "submit", "extract"],
        exposedParams: [
          {
            label: "OCR Model",
            nodeId: "prep",
            path: "nodes.prep.parameters.modelId",
            type: "string",
          },
        ],
      },
      finalize: {
        label: "Finalize",
        nodeIds: ["cleanup", "store"],
      },
    },
  };
}

/**
 * A `source.api` workflow whose declared fields drive the derived input schema,
 * so the Run drawer surfaces a trigger URL, input schema and sample curl (Part
 * 11 / workflow-as-API).
 */
function apiSourceConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "apiSource",
    ctx: {
      documentUrl: { type: "string" },
      priority: { type: "number" },
      documentId: { type: "string" },
    },
    nodes: {
      apiSource: {
        id: "apiSource",
        type: "source",
        sourceType: "source.api",
        label: "API endpoint",
        parameters: {
          fields: [
            {
              name: "documentUrl",
              type: "string",
              required: true,
              kind: "DocumentRef",
              description: "Blob URL of the document to process",
            },
            {
              name: "priority",
              type: "number",
              required: false,
              defaultValue: 0,
            },
          ],
          authNotes: "Send the group API key as the x-api-key header.",
        },
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(120, 160),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        ...pos(460, 160),
      },
    },
    edges: [
      { id: "src-prep", source: "apiSource", target: "prep", type: "normal" },
    ],
  };
}

/**
 * A `source.upload` workflow with explicit (non-default) parameters so the
 * source settings panel shows the allowed MIME types, size cap and ctx key
 * (Part 13 / document sources).
 */
function uploadSourceConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: { documentUrl: { type: "string" }, documentId: { type: "string" } },
    nodes: {
      upload1: {
        id: "upload1",
        type: "source",
        sourceType: "source.upload",
        label: "File upload",
        parameters: {
          allowedMimeTypes: ["application/pdf", "image/*"],
          maxFileSizeMB: 25,
          ctxKey: "documentUrl",
        },
        outputs: [{ port: "documentUrl", ctxKey: "documentUrl" }],
        ...pos(120, 200),
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "documentUrl" },
        ],
        ...pos(460, 200),
      },
    },
    edges: [
      { id: "u-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Demo definitions — each becomes one seeded workflow + one guide section.
// ---------------------------------------------------------------------------

const DEMOS = [
  {
    key: "typed-io",
    // `title` feeds the seeded workflow NAME, which the backend turns into
    // the stable slug the guide links to — keep it frozen so links survive
    // reseeds. `guideTitle` is what the guide heading/anchor renders (updated
    // for the port-wiring Phase 2 canvas: port rows replaced pills).
    title: "Typed I/O — coloured handles & type pills (Part 7)",
    guideTitle: "Typed I/O — coloured port rows (Part 7)",
    config: typedChainConfig,
    steps: [
      "Look at the node cards: every catalog port now gets its own **row** with a kind-coloured handle + label — inputs down the left edge, outputs down the right. **Submit OCR**'s several same-kind outputs each get their own row instead of collapsing into one grey handle.",
      "Hover a row (or its handle) to see `<name>: <Kind> — <description>` (e.g. `ocrResult: OcrResult — …` on **Extract**'s output).",
      'Click **Extract** — all 5 of its input rows are visible directly on the card; the old below-node "stacked pill" is gone.',
      'Click **Cleanup** — its single input row and single output row replace the old "arrow" type pill. Here the `ocrResult` input is auto-satisfied from **Extract** upstream, so its handle stays clean — the amber unsatisfied-ring appears in the Auto-wire demos below (e.g. *Lone Submit*), not here.',
    ],
  },
  {
    key: "autowire",
    title: "Auto-wire — typed input binding states (Part 8)",
    config: autoWireConfig,
    steps: [
      "Select **Submit OCR (auto-bound)** → the Inputs section shows its `fileData` auto-bound to *Prepare* with an **Auto** badge and a **Change source** button. No problems badge.",
      "**Lone Submit (unsatisfied)** carries a **problems badge** (top-left corner, amber) — the unbound input folds into the same per-node validation badge (no separate status dot). The top-bar count reflects it too.",
      '**Click the badge** → it selects the node and opens the node-scoped **“Problems on Lone Submit”** drawer; the unsatisfied `fileData` row carries a **“Pick a source →”** deep-link that opens the source picker (here it shows the *“add a producer”* guidance, since nothing upstream emits the needed kind).',
      "On the auto-bound node, click **Change source** → the binding locks; click **Revert to automatic** to restore it.",
      "On canvas, that bound `fileData` input now renders as a colored **data wire** running from *Prepare*'s output port to *Submit OCR (auto-bound)*'s input port — hover it for the same provenance text as the Inputs section (e.g. *\"Connected automatically — nearest Document producer\"*). *Lone Submit*'s unbound `fileData` shows no wire at all, matching its amber-ringed, unsatisfied port row.",
      '**Drag-to-bind:** drag from *Prepare*\'s `preparedData` **output port handle** to a compatible **input port handle** on another node — one gesture pins the data binding **and** the execution-order edge (the new wire hovers as *"Pinned by you"*). Incompatible ports dim during the drag and reject the drop with a yellow *"…can\'t be used here"* notice. Right-click a data wire → **Disconnect** / **Revert to automatic** to hand the port back to the resolver.',
    ],
  },
  {
    key: "ambiguous",
    title: "Auto-wire — ambiguous source picker (Part 8)",
    config: ambiguousConfig,
    steps: [
      "Two **Prepared file** producers (*Prepare A*, *Prepare B*) both feed **Submit OCR** — the resolver can't choose. (Both are `file.prepare`: `azureOcr.submit`'s `fileData` only accepts a **Prepared file**, so genuine ambiguity needs two producers of that same kind — a *Document reference* producer wouldn't compete.)",
      '**Submit OCR** carries a **problems badge** (top-left, amber). It also shows in the top-bar count and, via **More ▸** the Validation drawer, as *“Input "Prepared file data" has multiple possible sources — pick one”*.',
      '**Click the badge** → it selects the node and opens the node-scoped **“Problems on Submit OCR”** drawer; its `fileData` row carries a **“Pick a source →”** deep-link. Click it → the producer picker opens listing both *Prepare A* and *Prepare B*. Pick one — the badge clears.',
      "*Prepare B* carries its own badge — a **reachability** warning (it's a second root, not reachable from the entry node). One unified badge per node now folds in auto-wire **and** validation issues; the run-status circle stays in the top-right corner, so they never overlap.",
      "Before you pick, **no data wire** renders into Submit OCR's `fileData` port — the resolver hasn't chosen, so there's nothing to draw; the port row just shows its amber ring. After you pick a producer in step 3, a colored wire appears from that producer's port to Submit OCR.",
    ],
  },
  {
    key: "validation",
    title: "Validation surfacing — warning badge & drawer (5.4)",
    config: validationWarningConfig,
    steps: [
      "The **Orphan (unreachable)** node has no incoming edge → a validation issue is computed on load (no Save needed).",
      "The top-bar summary reads **1 warning** (amber); the orphan node shows an amber count badge.",
      "Click the node's badge → the **Validation** drawer opens with an entry anchored to `nodes.orphan` and the message *“…is not reachable from entry node…”*.",
    ],
  },
  {
    key: "node-settings",
    title: "Node settings panel & canvas basics (Part 3)",
    config: (n) => linearConfig(n),
    steps: [
      "Click **Submit to Azure OCR** → the right-hand **settings panel** opens with the node's editable **label** and a **type badge** (its activity type).",
      "Edit the label and click away (blur) — the node on the canvas updates live.",
      "Toggle **Show advanced** to reveal the node's raw **port bindings** — two lists, **Input bindings** and **Output bindings**. Every activity has typed **ports** (this OCR node has one input port `fileData` and three output ports — `apimRequestId`, `statusCode`, `headers`), and a *binding* wires a port to a **ctx key** — a named variable in the workflow's shared `ctx` bag. A port only needs a binding when you want to read/write it; here just `apimRequestId` is bound. Inputs *read from* a ctx key; outputs *write to* one. That's how data moves between nodes: **Prepare File Data** writes `preparedFileData`, and this node's `fileData` input reads it back.",
      "Change the `fileData` input's ctx key from `preparedFileData` to a brand-new name, e.g. `myNewVar`. On the node card the input row now reads **`fileData · from myNewVar`** — the *“from <ctxKey>”* suffix is simply the variable that port currently reads from.",
      'Because `myNewVar` isn\'t declared yet, a **+ Create variable "myNewVar"** button appears beneath the field. Binding a port to an *undeclared* ctx key is a save-blocking validation error (*“references undeclared ctx key”*); the button declares it inline (adds it to the workflow\'s `ctx`) so you skip the detour to **Workflow Settings**. Click it → the variable is declared, the binding becomes valid, and the error clears.',
      "Note there's **no error even though nothing produces `myNewVar`**. The validator only requires a bound ctx key to be *declared* (and that producer/consumer **kinds** match *when* a producer exists) — it does **not** require every consumed variable to have a producing node, since `ctx` can also be filled by the run's trigger/input. A declared-but-unproduced variable is intentionally valid.",
    ],
  },
  {
    key: "control-flow",
    title: "Control-flow forms & condition editor (Part 4)",
    config: controlFlowConfig,
    steps: [
      "This graph exists to show **all six** control-flow node types and their hand-rolled settings forms in one place — so some branches deliberately **dead-end** (the invoice sub-workflow, the approval gate) and the receipt branch **assumes** `apimRequestId` was supplied by the trigger rather than submitting a fresh OCR job. It's a forms showcase, not a runnable pipeline. Click each node to see its form:",
      "**Run for each document** (map) → collection/item/index ctx keys, max-concurrency, and body entry/exit node pickers.",
      "**Branch by condition** (switch, a yellow **diamond**) → its **cases** list + per-case **Edge** picker (only *conditional* edges are offered) + a **Default edge**.",
      "In that switch's first case, expand the **condition** — the second case holds a 3-level nested expression `AND( OR(EQ, GTE), NOT(IS-NULL) )` so you can watch the **recursive condition editor** render and toggle a leaf between **Ref** and **Literal**.",
      "**Collect results** (join) → the source-map picker lists **only map nodes**; **Wait until condition** (pollUntil) → activity picker + interval; **Wait for approval** (humanGate) → signal name, timeout, and the **On timeout** control (switch it to *Fallback* to reveal the fallback-edge picker).",
      "**Sub-workflow** (childWorkflow) → toggle **Library / Inline**; this demo ships an inline child graph.",
      "**Field drill-down (typed I/O):** the receipt branch runs a real Azure OCR chain — **Wait until condition** (pollUntil, `azureOcr.poll`) → **Extract OCR result** (`azureOcr.extract`), which produces `ocrResult` of kind **OCR result**. Select **Store Results** and open its **OCR result** input binding: the picker lists `ocrResult` **plus its fields** — `ocrResult.documentId`, `.blobPath`, `.storage`, `.byteLength`, `.pageCount`, `.status` — each captioned with its `type · optional`. You pick a field instead of typing (and guessing) the path. By contrast, `documents` / `currentDoc` are **untyped** trigger data and stay free-typed — no drill rows, because inventing a schema for data the system can't vouch for would be dishonest. The same drill-down applies to other typed producers now that they carry Zod-derived field schemas too — e.g. `preparedData` (a **Prepared file**) and a map body's segment item (a **Typed segment**) enumerate their fields in the picker the same way.",
      "UX polish (Part 16): note the **three-zone top bar** and the switch **diamond** shape; hover a node's output handle to get the **hover-to-extend** popover.",
      "**Kind-aware extend popover:** hover a **typed output port handle** and click the **➕** to extend — the popover is **filtered + ranked** to catalog activities that accept that port's kind (matching consumers float to the top), with a **Show all** escape back to the unfiltered list. Picking a filtered entry drops the node **pre-wired** — it lands with a pinned data wire already connected (drag-to-bind semantics).",
    ],
  },
  {
    key: "edges-validate",
    title: "Switch/error edges & validateFields editor (Part 5)",
    config: edgesValidateConfig,
    steps: [
      "This graph is a real chain: **Prepare File Data → Submit to Azure OCR → Extract OCR Result → Check Confidence → Route by review flag**, then either **Validate Fields** or **Store Results**.",
      "The **Prepare File Data** node has an `errorPolicy` fallback → a red **error edge** (`on error`) runs to **Reject document** (which records a rejection reason); normal edges stay grey.",
      '**Route by review flag** (switch) routes on `ctx.requiresReview`, which **Check Confidence** actually produces. It draws **conditional** edges with humanised labels — `if <predicate>` for the case (here `if ctx.requiresReview is true`) and `otherwise` for the default edge. Comparison operators read as words (`is`, `is not`, `contains`, `≥`, `≤`); logical groups collapse to `all of (N)` / `any of (N)`.',
      "Click **Validate Fields** → the rich rule editor shows three rule types — **arithmetic**, **field-match** and **array-match** — not an “Unsupported field schema” stub. Change a rule's **type** and confirm `name` is preserved. (Its `processedSegments` input is a trigger-supplied value — producing real segments would need the full split/classify chain, which this demo leaves out to stay focused on the rule editor.)",
    ],
  },
  {
    key: "condition-step-ref",
    title: "Conditions from node outputs — step picker (Part 4)",
    config: conditionStepRefConfig,
    steps: [
      "Select **Route by prepared data** (the switch) → its settings open. Expand the first **case**'s **condition** — the `is-not-null` value field is in **Ref** mode and defaults to the **step→port picker** (not a raw-key field). It already shows the resolved caption **Prepare file → Prepared file data** because the ref points at *Prepare file*'s output (4.8/4.9).",
      'The picker lists **every upstream output port** as a **"Node → Port"** row with the kind as a hint — there\'s **no kind filter** here (a condition can compare any value). This graph has one upstream producer, so you see the single *Prepare file → Prepared file data* row.',
      'Click **"Enter a variable manually"** → the raw-key autocomplete appears (the escape hatch for a ctx key no step produces, 4.10/4.11); click **"Back to steps"** to return to the step picker.',
      "The resolution round-trips: because *Prepare file* carries the matching `preparedData` output binding and sits upstream of the switch, the caption resolves on **load** — no Save needed. Saving + reloading keeps it resolved (not the raw `__auto.prep.preparedData` key), and at run time the producer's output is materialised into `ctx` so the condition evaluates against a real value (4.12).",
      '**Reading a complex condition.** Every `and`/`or` group is headed by a verb — **“ALL of these must be true”** (AND) / **“ANY of these can be true”** (OR) — with a **humanised one-line summary shown directly under it at every level** (e.g. the outer group reads `(type is "receipt" or confidence ≥ 0.8) and not (blobKey is null)`, the nested group reads `type is "receipt" or confidence ≥ 0.8`), so you can read the boolean logic without re-assembling the nested form. A **chevron** collapses each group to just that summary, keeping deep trees navigable.',
    ],
  },
  {
    key: "grouping",
    title: "Grouping, simplified view & node swap (Part 6)",
    config: groupingConfig,
    steps: [
      "This chain ships pre-organised into two groups — **OCR Extraction** (Prepare → Submit → Extract) and **Finalize** (Cleanup → Store). The **OCR Extraction** group exposes one **parameter**, *OCR Model*, wired to `Prepare File Data`'s real `modelId` parameter.",
      "Open **More ▸ Simplified view** → each group collapses to a single **chip**; click the **OCR Extraction** chip → **GroupNodeSettings** opens with its label/description/colour and the **Exposed parameters** editor (member node + path + type). The *OCR Model* row targets member node **Prepare File Data**, path `nodes.prep.parameters.modelId`.",
      "In the exposed-params editor, remove **Prepare File Data** from the group → the *OCR Model* param that referenced it is **pruned** with a toast.",
      "Turn simplified view off. Right-click an **activity** node → **Change activity type** → pick a new type (label/ports/position preserved). Right-click a control-flow node and note the entry is **disabled**.",
      "**More ▸ Auto-arrange** re-lays the graph left-to-right and re-fits.",
    ],
  },
  {
    key: "workflow-as-api",
    title: "Workflow-as-API — trigger URL & schema (Part 11)",
    config: apiSourceConfig,
    steps: [
      "This workflow starts with a **source.api** node declaring two fields (`documentUrl` required, `priority` optional).",
      "Click **Run this workflow** (top bar) → the Run drawer shows the **Trigger URL**, the derived **input schema** (only the declared fields), a copyable **sample curl**, and the **auth notes**.",
      "Select the **API endpoint** node → SourceNodeSettings lets you edit the field list (name / type / kind / required).",
    ],
  },
  {
    key: "sources-upload",
    title: "Document sources — file upload (Part 13)",
    config: uploadSourceConfig,
    steps: [
      "Select the **File upload** source node → SourceNodeSettings exposes `allowedMimeTypes` (`application/pdf`, `image/*`), `maxFileSizeMB` (25 here) and `ctxKey` (`documentUrl`).",
      "The source node has **no input handle** and a single blue **Document** output.",
      "Adding a *second* source of the same subtype is rejected by the validator (single-source rule) — see `MANUAL_TEST_PLAN.md` 13.7.",
    ],
  },
  {
    key: "try-preview",
    title: RUN_DEMOS.tryPreview.title,
    config: sourcePrepConfig,
    infra: true,
    steps: [
      "Select the **Upload** source node → use **Upload & Try** and pick any PDF/image.",
      "Watch the per-node **run-status badges** go blue → green as the run executes (no Azure needed — this chain just prepares the file).",
      "The **Upload** node renders a **document preview** of what you uploaded.",
      "**Click a data wire** (a coloured port-to-port wire) — a popover pops at the wire midpoint showing the exact value that flowed across it (a kind widget where one exists, else a truncated JSON snippet). Right-clicking the wire offers the same thing via **“View data.”** Click a wire *before* running and it reads **“Run to see the data flowing here.”**",
      "**Don't want to upload anything?** Run `npm run seed:demo-runs` once and this workflow arrives with three real runs already in its history — a green one, a **cache-hit** re-run whose *Prepare* step comes back `skipped`, and one that genuinely **failed**. Open **Run history** from the top bar and pick one.",
      "⚠️ Requires the Temporal **worker** + **deno-runner** to be running (the `dev: all` task).",
    ],
  },
  {
    key: "run-branch-error",
    title: RUN_DEMOS.branchError.title,
    config: runBranchErrorConfig,
    infra: true,
    steps: [
      "Run `npm run seed:demo-runs` first — it drives **two real runs** through this graph, and the states below only exist once it has.",
      "Open **Run history** (top bar) and pick the **older** run (the one whose input `documentUrl` ends in a real upload path). *Prepare file* is green, and the **switch** routed down the **file type is pdf** edge — that edge is drawn as **taken**, the *image* edge stays dim, and *Mark as image work* never ran.",
      "The switch is not routing on a hand-set flag: its case compares `ctx.preparedFileData.fileType` against `\"pdf\"`, and `fileType` is a value the *Prepare file* step computed from the actual bytes.",
      "Now pick the **newer** run (input `documentUrl` = `does/not/exist.pdf`). *Prepare file* is **red** — and because it carries an `errorPolicy` of **fallback**, the run did not die: the red **error edge** to *Mark rejected* is drawn as **taken**, and that step really wrote `failed` onto the document.",
      "Select *Prepare file* → **Settings ▸ Error handling** shows the `fallback` policy and the edge it falls back to. Its `retry` is set to a single attempt so the failure lands immediately.",
      "⚠️ Requires the Temporal **worker** (the `dev: all` task).",
    ],
  },
  {
    key: "run-human-gate",
    title: RUN_DEMOS.humanGate.title,
    config: runHumanGateConfig,
    infra: true,
    steps: [
      "Run `npm run seed:demo-runs` first.",
      "Open **Run history**. The newest run is still **running** — it is parked on *Wait for approval*, a **humanGate** waiting up to 30 days for a `humanApproval` signal nobody sent. This is the only way to see a run mid-flight: *Upload* and *Prepare file* are green, the gate is blue/running, and *Mark completed* has not started.",
      "The run **below** it reads **cancelled**. That is not a fabrication either: both were started as canvas **Tries**, and starting a Try cancels the lineage's previous one (D-17), so the first was cancelled server-side by the second.",
      "Filter Run history by **cancelled**, then by **running** — each filter has a real row behind it.",
      "The document behind the waiting run sits at `awaiting_review`, because that is what a gate does to the document it is holding.",
      "⚠️ Requires the Temporal **worker** (the `dev: all` task). The waiting run is left open **on purpose** — it is not a hung workflow.",
    ],
  },
  {
    key: "run-replay-versions",
    title: RUN_DEMOS.replayVersions.title,
    config: runReplayVersionsV1Config,
    secondVersion: runReplayVersionsV2Config,
    infra: true,
    steps: [
      "Run `npm run seed:demo-runs` first.",
      "This workflow has **two versions**. `v2` (head) has a third step, *Mark as processing (added in v2)*; `v1` stops after *Prepare file*.",
      "The seeded run was executed against **v1**, on purpose — **Run history** shows it stamped `v1` while the canvas you are looking at is `v2`.",
      "Open that run and **Replay** it: the canvas swaps to the graph **as it was at v1** — the *Mark as processing* step disappears, because it did not exist when the run happened. The replay banner names the pinned version.",
      "Leave replay (any of its exits) → the canvas returns to head (`v2`) and the step comes back.",
      "⚠️ Requires the Temporal **worker** (the `dev: all` task).",
    ],
  },
  {
    key: "versioning",
    title: "Versioning — history & revert (Part 12)",
    config: (n) => linearConfig(n, "Submit to Azure OCR"),
    secondVersion: (n) => linearConfig(n, "Submit to Azure OCR (v2 — edited)"),
    steps: [
      "This workflow has **two saved versions**. Open **More ▸ History**.",
      "You'll see `v2` (head) and `v1`, newest-first, each with a timestamp.",
      "Click **Revert** on `v1` → confirm → the canvas reloads v1's config (the Submit label reverts) and v1 becomes head.",
      "Use **Compare to head** to see the two configs side-by-side.",
    ],
  },
  {
    key: "library",
    title: "Library workflow (Part 10)",
    // 7.8 / 10.4 / 12.5 — a library is only interesting once it declares a
    // SIGNATURE. Without typed ports the childWorkflow summary a reader is
    // sent to look at renders "0 INPUTS | 0 OUTPUTS", and 7.8's kind
    // annotations have nothing to annotate. Two versions so 12.5's
    // "pick v2 → stamps version:2" has a v2 to pick.
    config: (n) => withLibraryPorts(linearConfig(n)),
    secondVersion: (n) =>
      withLibraryPorts(linearConfig(n, "Submit to Azure OCR (v2 — edited)")),
    kind: "library",
    steps: [
      "This is a **library** workflow (a reusable building block, not a top-level runnable).",
      "Open the workflows list and switch to the **Library** view/kind — this entry appears there.",
      "It declares a **typed signature**: an input *Prepared file* (`PreparedFile`) and an output *OCR result* (`OcrResult`). Those kinds show in the library port editor, in the library picker's preview, and on a `childWorkflow` node's settings summary (7.8).",
      "In another workflow you can drop a **Child workflow** node and pick this from the Library picker.",
      "It has **two versions**, so after picking it you can use the **Version** select to pin `v2` instead of tracking head (12.5).",
    ],
  },
];

/**
 * Give a library config the declared signature `metadata.inputs` /
 * `metadata.outputs` that makes it referencable with kinds (US-099/US-100).
 * Paths must resolve to a declared ctx key or a node output in the same graph —
 * the backend refuses the save otherwise.
 */
function withLibraryPorts(config) {
  return {
    ...config,
    metadata: {
      ...config.metadata,
      inputs: [
        {
          label: "Prepared file",
          path: "preparedFileData",
          type: "object",
          kind: "PreparedFile",
        },
      ],
      outputs: [
        {
          label: "OCR result",
          path: "ocrResult",
          type: "object",
          kind: "OcrResult",
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Dynamic-node demo (Part 14) — publish-time needs the deno-runner toolchain
// (jsdoc-parse → signature-semantics → ts-check → allowlist), so this demo is
// seeded best-effort: when the runner is down the publish fails and the demo
// is skipped with a console note instead of failing the whole seeder.
// ---------------------------------------------------------------------------

const DYN_DEMO_NAME = "demo-uppercase";

function demoDynamicNodeScript() {
  return `import type { Document } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name ${DYN_DEMO_NAME}
 * @description Uppercases the prepared file's fileName.
 * @deterministic true
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  ctx: { document: Document },
  _params: Record<string, unknown>,
): Promise<{ result: { fileName: string } }> {
  // Bound to a Prepared file (a Document subkind), whose shape carries
  // fileName — not a bare url.
  const fileName = String((ctx.document as { fileName?: string }).fileName ?? "");
  return { result: { fileName: fileName.toUpperCase() } };
}`;
}

/**
 * Publish (idempotently) the demo dynamic node under the stable base slug;
 * null when the toolchain is down. The backend restores soft-deleted
 * lineages on re-publish (POST = create-or-restore), so a tombstone from a
 * prior seed publishes cleanly — no `-N` suffix churn. PUT appends a version
 * when the lineage is already live.
 */
async function publishDemoDynamicNode() {
  const live = await api("GET", `/api/dynamic-nodes/${DYN_DEMO_NAME}`).catch(
    () => null,
  );
  try {
    if (live) {
      await api("PUT", `/api/dynamic-nodes/${DYN_DEMO_NAME}`, {
        script: demoDynamicNodeScript(),
      });
    } else {
      // POST restores a soft-deleted lineage as well as creating a new one.
      await api("POST", "/api/dynamic-nodes", {
        script: demoDynamicNodeScript(),
      });
    }
    return DYN_DEMO_NAME;
  } catch (err) {
    console.warn(
      `  ⚠ dynamic-node demo skipped — publish failed (deno-runner down?): ${String(err).slice(0, 160)}`,
    );
    return null;
  }
}

/** `file.prepare` (Document producer) → the published `dyn.<slug>` node. */
function dynamicNodeConfig(name, slugName) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
      uppercasedName: { type: "object" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(120, 140),
      },
      dynNode: {
        id: "dynNode",
        type: "activity",
        label: "Uppercase filename (custom)",
        activityType: `dyn.${slugName}`,
        // The dynamic-node binding walk requires the required `document`
        // input to be explicitly bound (auto-wire doesn't cover dyn nodes).
        inputs: [{ port: "document", ctxKey: "preparedFileData" }],
        // 14.9 — bind the OUTPUT too, or the preview has nothing to read and
        // honestly says so ("this step's output isn't bound to a workflow
        // value yet"). With the binding AND `@deterministic true` the run
        // caches the result and the widget shows the uppercased fileName.
        outputs: [{ port: "result", ctxKey: "uppercasedName" }],
        ...pos(460, 140),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "dynNode", type: "normal" }],
  };
}

/**
 * D2 (14.8) — a workflow that references a dynamic node whose lineage has been
 * SOFT-DELETED, seeded already in that end state.
 *
 * The plan asks the reader to go and delete a lineage themselves. That is
 * destructive, it consumes the Part-14 demo for whoever walks next, and it
 * leaves the group's catalog different from how it started. Seeding the end
 * state instead means the reader just opens this and sees the failure modes.
 */
const DELETED_DYN_SLUG = "demo-deleted-node";

function deletedDynScript() {
  return `import type { Document } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name ${DELETED_DYN_SLUG}
 * @description Exists only to be deleted, so a workflow can reference a tombstone.
 * @deterministic true
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  ctx: { document: Document },
  _params: Record<string, unknown>,
): Promise<{ result: unknown }> {
  return { result: ctx.document };
}`;
}

function deletedDynConfig(name) {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "prep",
    ctx: {
      blobKey: { type: "string" },
      documentId: { type: "string" },
      preparedFileData: { type: "object" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [
          { port: "documentId", ctxKey: "documentId" },
          { port: "blobKey", ctxKey: "blobKey" },
        ],
        outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        ...pos(120, 140),
      },
      goneNode: {
        id: "goneNode",
        type: "activity",
        label: "Custom step (lineage deleted)",
        activityType: `dyn.${DELETED_DYN_SLUG}`,
        inputs: [{ port: "document", ctxKey: "preparedFileData" }],
        ...pos(460, 140),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "goneNode", type: "normal" }],
  };
}

const DELETED_DYN_STEPS = [
  "This workflow references a custom node whose **lineage has been deleted**. Nothing to set up — it ships in that state.",
  "The canvas node carries a red **Deleted** badge and its settings show *(deleted dynamic node)*.",
  "The validation chip reads **1 error** — *Activity type `dyn.demo-deleted-node` is not registered*. Give the activity catalog a moment to load: `dyn.*` types are deliberately given the benefit of the doubt while it is still fetching, so the error appears a beat after the canvas.",
  "⚠️ **Known gap (D-11):** **Try** and **Run** are still enabled here even though the graph cannot run — a run fails at `dynamicNode.resolveLineage`. Whether *any* validation error should disable Try, or only errors that make the graph structurally unrunnable, is an open product decision.",
  "Restoring it is one step: publish a node with the **same name** from **Dynamic nodes ▸ New custom node** and the lineage comes back with its history continued (14.14).",
];

const DYN_DEMO_STEPS = [
  "The **CUSTOM** section of the activity palette lists **demo-uppercase** with a **DYN** badge — click it to drop another instance.",
  "The canvas node carries a purple **DYN** pill; select it → the Inputs section shows its `document` port bound to *Prepare*'s output.",
  "Right-click the node → **Edit script** opens the script editor with the published TypeScript source (JSDoc `@inputs`/`@outputs` drive the ports).",
  "**+ New custom node** (palette) opens the authoring editor — publishing runs the jsdoc → signature → ts-check → allowlist gates (`MANUAL_TEST_PLAN.md` Part 14).",
  "**Delete + re-create restores the node:** delete this custom node (**Dynamic nodes** page), then **+ New custom node** and publish the *same* name — it comes back with its history continued (v2), instead of dead-ending on a reserved-slug conflict (14.14).",
  "**Try it (14.9):** the script is tagged `@deterministic true`, so its output is **cached** and the node shows a real **preview** after a run — an untagged (non-deterministic) script re-executes every run and is deliberately never cached, so it has no preview to show.",
  "⚠️ *Executing* this node in a run additionally needs the deno-runner service up (`docker compose -f deployments/local/docker-compose.deno.yml up -d`) — the worker mints the script's platform-API token itself, so no extra key is needed (14.9).",
];

// ---------------------------------------------------------------------------

function unwrap(created) {
  return created && created.workflow ? created.workflow : created;
}

function listItems(list) {
  if (Array.isArray(list)) return list;
  return list.workflows ?? list.data ?? list.items ?? [];
}

async function deleteExistingDemos() {
  // The default list is primary-kind only; sweep the library kind too so the
  // library demo is also replaced (otherwise it accumulates across re-runs).
  const seen = new Map();
  for (const q of ["", "&kind=library"]) {
    const list = await api("GET", `/api/workflows?limit=200${q}`).catch(
      () => ({}),
    );
    for (const w of listItems(list)) {
      if ((w.name || "").startsWith(NAME_PREFIX)) seen.set(w.id, w);
    }
  }
  for (const id of seen.keys()) {
    await api("DELETE", `/api/workflows/${id}`).catch(() => {});
  }
  return seen.size;
}

/** Create one workflow demo; returns its guide-result row. */
async function createDemo(demo) {
  const name = `${NAME_PREFIX}${demo.title}`;
  const config = withArrangeOnLoad(
    typeof demo.config === "function" ? demo.config(name) : demo.config,
  );
  const created = unwrap(
    await api("POST", "/api/workflows", {
      name,
      config,
      groupId: GROUP_ID,
      kind: demo.kind,
    }),
  );
  if (demo.secondVersion) {
    // G-063: the update endpoint requires `expectedVersion` (optimistic
    // concurrency) and its DTO is whitelisted, so `groupId` — which is fixed
    // at create time and not updatable — is now a hard 400 rather than a
    // no-op. A freshly created lineage is always at v1.
    await api("PUT", `/api/workflows/${created.id}`, {
      name,
      config: withArrangeOnLoad(demo.secondVersion(name)),
      expectedVersion: created.version ?? 1,
    });
  }
  console.log(`  ✓ ${demo.key.padEnd(14)} ${created.id}`);
  return { ...demo, id: created.id, slug: created.slug };
}

/**
 * Best-effort dynamic-node demo (Part 14) — see publishDemoDynamicNode.
 * Returns its guide-result row, or null when the dynamic node couldn't be
 * published.
 */
/**
 * D2 — publish a lineage, build a workflow on it, then soft-delete the
 * lineage so the demo ships already broken. Best-effort like its sibling: no
 * deno-runner means no publish, so the demo is skipped rather than failing the
 * whole seeder.
 */
async function createDeletedDynDemo() {
  let published;
  try {
    published = await api("POST", "/api/dynamic-nodes", {
      script: deletedDynScript(),
    });
  } catch {
    console.log("  – deleted-dyn    skipped (deno-runner unavailable)");
    return null;
  }
  if (!published?.slug) return null;
  const title = "Deleted custom node — Deleted badge & catalog error (Part 14)";
  const name = `${NAME_PREFIX}${title}`;
  const created = unwrap(
    await api("POST", "/api/workflows", {
      name,
      config: withArrangeOnLoad(deletedDynConfig(name)),
      groupId: GROUP_ID,
    }),
  );
  // Tombstone the lineage AFTER the workflow references it — that ordering is
  // the whole point of the fixture.
  await api("DELETE", `/api/dynamic-nodes/${DELETED_DYN_SLUG}`);
  console.log(
    `  ✓ ${"deleted-dyn".padEnd(14)} ${created.id} (dyn.${DELETED_DYN_SLUG} tombstoned)`,
  );
  return {
    key: "deleted-dyn",
    title,
    steps: DELETED_DYN_STEPS,
    id: created.id,
    slug: created.slug,
    dyn: true,
  };
}

async function createDynamicNodeDemo() {
  const dynSlug = await publishDemoDynamicNode();
  if (!dynSlug) return null;
  const title =
    "Dynamic (custom-code) node — DYN pill & script editor (Part 14)";
  const name = `${NAME_PREFIX}${title}`;
  const created = unwrap(
    await api("POST", "/api/workflows", {
      name,
      config: withArrangeOnLoad(dynamicNodeConfig(name, dynSlug)),
      groupId: GROUP_ID,
    }),
  );
  console.log(
    `  ✓ ${"dynamic-node".padEnd(14)} ${created.id} (dyn.${dynSlug})`,
  );
  return {
    key: "dynamic-node",
    title,
    steps: DYN_DEMO_STEPS,
    id: created.id,
    slug: created.slug,
    dyn: true,
  };
}

async function seed() {
  console.log(`Seeding feature demos → ${BACKEND_URL} (group ${GROUP_ID})`);
  const removed = await deleteExistingDemos();
  if (removed) console.log(`  cleared ${removed} previous demo(s)`);

  // The /workflows list is ordered newest-first (created_at desc). We want it
  // to read top-to-bottom in FEATURE_DEMO_GUIDE order, so we CREATE the demos
  // in REVERSE of guide order: the guide-first demo is created last (newest)
  // and lands at the top. Guide order is [...DEMOS, dynamic-node], so the
  // dynamic node (guide-last) is created FIRST (oldest → bottom). We still
  // return `results` in guide order so renderGuide is unchanged.
  //
  // NOTE: this leans on each create getting a strictly later created_at than
  // the previous one — reliable in practice because every create is a
  // separate awaited HTTP round-trip.
  const dynResult = await createDynamicNodeDemo();
  const deletedDynResult = await createDeletedDynDemo();

  const mainReversed = [];
  for (let i = DEMOS.length - 1; i >= 0; i--) {
    mainReversed.push(await createDemo(DEMOS[i]));
  }
  const mainResults = mainReversed.reverse();

  return [...mainResults, dynResult, deletedDynResult].filter(Boolean);
}

function renderGuide(results, agentResults = []) {
  // Slug-based links resolve through `/workflows/by-slug/<slug>/edit` — the
  // slug is derived from the (stable) demo name, so these links survive a
  // reseed even though each workflow's lineage id is regenerated. Fall back
  // to the id link for the rare demo whose create response lacked a slug.
  const link = (r) =>
    r.slug
      ? `${FRONTEND_URL}/workflows/by-slug/${r.slug}/edit`
      : `${FRONTEND_URL}/workflows/${r.id}/edit`;
  // Combined "one place" link: open the built workflow's editor (canvas shows
  // the graph) AND pass ?agentChat=<id> so the drawer opens and replays the
  // conversation beside it. The slug redirect preserves the query string.
  // Falls back to the drawer-on-root form if the create lacked a slug.
  const chatLink = (r) =>
    r.slug
      ? `${FRONTEND_URL}/workflows/by-slug/${r.slug}/edit?agentChat=${r.convId}`
      : `${FRONTEND_URL}/?agentChat=${r.convId}`;
  const lines = [];
  lines.push("# Workflow Builder — Feature Demo Guide");
  lines.push("");
  lines.push(
    "A fast, click-through companion to `MANUAL_TEST_PLAN.md`. Each entry is a" +
      " pre-built workflow that demonstrates **one** feature — open the link and" +
      " follow the steps, no set-up required.",
  );
  lines.push("");
  lines.push(
    "> **Not auto-seeded.** These workflows only exist if `npm run seed:demos`" +
      " has been run against your current database — every link below 404s" +
      " otherwise. Run it before walking any entry (needs the backend up on" +
      " :3002); safe to re-run any time (idempotent).",
  );
  lines.push("");
  lines.push(
    "> **Generated by** `scripts/seed-feature-demos.mjs`. Re-run it to",
  );
  lines.push(
    "> (re)create these workflows — e.g. after a database reset. The links",
  );
  lines.push(
    "> below are **slug-based and stable**: they keep working across reseeds",
  );
  lines.push(
    "> (the lineage id is regenerated, but the slug is not). Requires the",
  );
  lines.push("> backend running on :3002.");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run seed:demos");
  lines.push("```");
  lines.push("");
  lines.push(
    "> How the seeder works (prereqs, env, extending it): see" +
      " [FEATURE_DEMO_SEEDER.md](FEATURE_DEMO_SEEDER.md).",
  );
  lines.push("");
  lines.push(
    "> **New to the builder?** [DATAFLOW_CONCEPTS.md](DATAFLOW_CONCEPTS.md)" +
      " explains how data moves between nodes — ctx keys, why a wire is just" +
      " two ports sharing a key, auto vs hand-authored keys, and when to" +
      " declare a variable. Worth reading before Part 3.",
  );
  lines.push("");
  lines.push("## Contents");
  lines.push("");
  for (const r of results) {
    const heading = r.guideTitle ?? r.title;
    lines.push(`- [${heading}](#${slug(heading)})`);
  }
  if (agentResults.length > 0) {
    lines.push("- [🤖 AI agent chat logs](#-ai-agent-chat-logs)");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const r of results) {
    lines.push(`## ${r.guideTitle ?? r.title}`);
    lines.push("");
    lines.push(`**▶ Open:** [${link(r)}](${link(r)})`);
    if (r.infra) {
      lines.push("");
      lines.push(
        "> Needs the Temporal worker + deno-runner live (the `dev: all` task).",
      );
    }
    lines.push("");
    for (const step of r.steps) {
      lines.push(`1. ${step}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  if (agentResults.length > 0) {
    lines.push("## 🤖 AI agent chat logs");
    lines.push("");
    lines.push(
      "Transcripts captured from **real live runs** of the workflow agent" +
        " (Azure gpt-5.4). Open the demo link — the workflow the agent built" +
        " loads on the canvas **and** the agent drawer opens and **replays**" +
        " the whole conversation (your prompt + every tool call it made)" +
        " beside it, so you can see the result and how it was built in one" +
        " place.",
    );
    lines.push("");
    lines.push(
      "> The chat log opens for **anyone in the group**: seeded transcripts" +
        " are flagged as demo data (`isDemo`), which makes them group-visible" +
        " and **read-only** — your own conversations stay private to you, and" +
        " nobody can append a turn to a demo replay. Start a new conversation" +
        " to chat with the agent yourself. The transcript replays as it" +
        " happened — including the agent's own end-to-end self-test against" +
        " the built-in sample document.",
    );
    lines.push("");
    for (const r of agentResults) {
      lines.push(`### ${r.title}`);
      lines.push("");
      lines.push(
        `**▶ Open (canvas + chat replay):** [${chatLink(r)}](${chatLink(r)})`,
      );
      lines.push("");
      lines.push(`**Workflow only:** [${link(r)}](${link(r)})`);
      lines.push("");
      for (const step of r.steps ?? []) {
        lines.push(`1. ${step}`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }
  lines.push(
    "> **Want the run-time states too?** This script only builds graphs — it" +
      " never executes one. `npm run seed:demo-runs` (a separate, opt-in step;" +
      " needs the Temporal worker) drives **real** runs through the four" +
      " run-state demos above, so node badges, taken edges, cache hits, an" +
      " in-flight run, a cancelled run and replay all have something true" +
      " behind them. Run it after this script; re-seeding here orphans the" +
      " runs, so re-run it too.",
  );
  lines.push("");
  const dynSeeded = results.some((r) => r.dyn);
  lines.push(
    "_Not seeded here because they need a live worker" +
      (dynSeeded ? "" : ", the deno-runner") +
      " or LLM credentials: real OCR output previews (Part 9 run-time)," +
      " dynamic-node " +
      (dynSeeded
        ? "execution/security (Part 14 run-time — the editor surface is seeded above)"
        : "authoring/execution/security (Part 14)") +
      ". The AI agent (Part 15) chat-log replays are seeded above; driving" +
      " the live agent to build a NEW workflow still needs the stack + a" +
      " configured model. Walk those from `MANUAL_TEST_PLAN.md` with the" +
      " stack up._",
  );
  lines.push("");
  return lines.join("\n");
}

function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
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

/**
 * Seed the agent chat-log demos. For each fixture: (re)create the built
 * workflow via the API, then insert its ChatConversation + ChatMessage rows
 * directly (there is no API to create an arbitrary transcript). The
 * conversation gets a FIXED id so the guide's `?agentChat=<id>` deep link is
 * stable across reseeds, and `isDemo` marks it as demo data — group-visible
 * to whoever opens the link, and a read-only replay for everyone including
 * the identity that seeded it.
 */
async function seedAgentDemos() {
  const require = createRequire(import.meta.url);
  const {
    PrismaClient,
  } = require("../apps/backend-services/src/generated/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  // The generated client is configured for a driver adapter (matching
  // seed.ts). Build the pg adapter from DATABASE_URL (loaded from the backend
  // .env above); honour PGSSLMODE if set, otherwise a plain connection string.
  let connectionString = process.env.DATABASE_URL ?? "";
  const sslMode = process.env.PGSSLMODE;
  if (sslMode && connectionString) {
    try {
      const parsed = new URL(connectionString);
      parsed.searchParams.set("sslmode", sslMode);
      parsed.searchParams.set("uselibpqcompat", "true");
      connectionString = parsed.toString();
    } catch {
      // keep the raw connection string
    }
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const results = [];
  try {
    // `createdBy` is NOT NULL, so a demo still records who seeded it — but
    // it no longer decides who can SEE it. Visibility comes from `isDemo`
    // (group-wide), which is what makes the replay open for the person
    // walking the test plan rather than only for the seeder. Preference
    // order is unchanged: the SEED_USER_SUB user's actor (the IDIR identity
    // the links are opened as), else the group's ApiKey actor (CI / e2e).
    let createdBy = null;
    let ownerLabel = "";
    const seedUserSub = process.env.SEED_USER_SUB;
    if (seedUserSub) {
      const user = await prisma.user.findUnique({
        where: { id: seedUserSub },
        select: { actor_id: true },
      });
      if (user) {
        createdBy = user.actor_id;
        ownerLabel = "SEED_USER_SUB";
      }
    }
    if (!createdBy) {
      // ApiKey.group_id is unique — one key per group. Its actor is what an
      // x-api-key request for this group authenticates as.
      const key = await prisma.apiKey.findUnique({
        where: { group_id: GROUP_ID },
        select: { actor_id: true },
      });
      if (key) {
        createdBy = key.actor_id;
        ownerLabel = "api-key actor";
      }
    }
    if (!createdBy) {
      console.log(
        `  ! skipped agent demos — could not resolve an owner actor (set SEED_USER_SUB or seed an API key for group ${GROUP_ID})`,
      );
      return results;
    }
    console.log(`  agent chat logs owned by: ${ownerLabel}`);

    // Collect the fixture conversation ids up front so we can remove any
    // previously-seeded demo conversation that is no longer a fixture (all
    // demo conversation ids are `demo-agent-*`). Keeps re-runs idempotent
    // when a scenario is dropped.
    const fixtures = AGENT_DEMO_FIXTURES.map((file) =>
      JSON.parse(
        readFileSync(resolve(__dirname, "agent-demo-fixtures", file), "utf-8"),
      ),
    );
    const keepIds = fixtures.map((fx) => fx.conversationId);
    const removed = await prisma.chatConversation.deleteMany({
      where: {
        groupId: GROUP_ID,
        id: { startsWith: "demo-agent-", notIn: keepIds },
      },
    });
    if (removed.count) {
      console.log(`  cleared ${removed.count} stale demo chat log(s)`);
    }

    for (const fx of fixtures) {
      const created = unwrap(
        await api("POST", "/api/workflows", {
          name: fx.workflow.name,
          description: fx.workflow.description,
          config: withArrangeOnLoad(fx.workflow.config),
          groupId: GROUP_ID,
        }),
      );

      await prisma.chatConversation.upsert({
        where: { id: fx.conversationId },
        update: {
          workflowId: created.id,
          groupId: GROUP_ID,
          createdBy,
          provider: fx.provider,
          model: fx.model,
          title: fx.title,
          isDemo: true,
        },
        create: {
          id: fx.conversationId,
          workflowId: created.id,
          groupId: GROUP_ID,
          createdBy,
          provider: fx.provider,
          model: fx.model,
          title: fx.title,
          isDemo: true,
        },
      });

      // Replace messages so a re-run is idempotent. Explicit increasing
      // createdAt keeps replay order stable even within the same millisecond.
      await prisma.chatMessage.deleteMany({
        where: { conversationId: fx.conversationId },
      });
      const base = Date.now();
      for (let i = 0; i < fx.messages.length; i++) {
        const m = fx.messages[i];
        await prisma.chatMessage.create({
          data: {
            conversationId: fx.conversationId,
            role: m.role,
            content: m.content,
            inputTokens: m.inputTokens ?? null,
            outputTokens: m.outputTokens ?? null,
            createdAt: new Date(base + i * 1000),
          },
        });
      }

      results.push({
        title: fx.title,
        convId: fx.conversationId,
        slug: created.slug,
        steps: fx.steps,
        agent: true,
      });
      console.log(
        `  ✓ ${"agent-demo".padEnd(14)} ${created.id} (chat ${fx.conversationId})`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
  return results;
}

async function main() {
  apiKey = await resolveApiKey();
  if (!apiKey) {
    throw new Error(
      `401 — none of the ${CANDIDATE_KEYS.length} candidate API key(s) were ` +
        "accepted by the backend",
    );
  }
  const results = await seed();
  const agentResults = await seedAgentDemos();
  writeFileSync(GUIDE_PATH, renderGuide(results, agentResults), "utf-8");
  console.log(`\nGuide written → ${GUIDE_PATH}`);
  console.log(`Open the workflows list: ${FRONTEND_URL}/workflows`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  if (/\b401\b|Invalid API key|Unauthorized/i.test(err.message)) {
    console.error(
      "\nThe backend accepted none of the API keys it tried (shell" +
        " TEST_API_KEY, apps/backend-services/.env TEST_API_KEY, and the" +
        " documented default). The backend validates x-api-key against the" +
        " value the DB was seeded with. Fix by re-seeding so they line up" +
        " (`npm run test:db:reset`) or pass the seeded key explicitly:\n" +
        "  TEST_API_KEY=<your-seeded-key> npm run seed:demos",
    );
  } else if (/fetch failed|ECONNREFUSED|connect/i.test(err.message)) {
    console.error(
      `\nCould not reach the backend at ${BACKEND_URL}. Start it (the` +
        " `dev: all` task / `npm run dev:backend`) and retry.",
    );
  }
  process.exit(1);
});
