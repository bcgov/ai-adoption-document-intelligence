#!/usr/bin/env node
/**
 * Seed a set of "feature demo" workflows into the local seed group and generate
 * a click-through guide (docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md) with a
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

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const NAME_PREFIX = "🎯 Demo — ";
// Agent chat-log demos: transcripts captured from real live agent runs
// (Azure gpt-5.4), seeded as ChatConversation + ChatMessage rows so the
// FEATURE_DEMO_GUIDE `?agentChat=<id>` links replay them. Fixture workflow
// names carry NAME_PREFIX so deleteExistingDemos() sweeps them too.
const AGENT_DEMO_FIXTURES = ["scenario-1.json"];
const GUIDE_PATH = resolve(
  __dirname,
  "../docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md",
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
const withArrangeOnLoad = (config) => ({
  ...config,
  metadata: { ...(config.metadata ?? {}), arrangeOnLoad: true },
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
      normB: {
        id: "normB",
        type: "activity",
        label: "Normalize B",
        activityType: "document.normalizeOrientation",
        // Root node reading a workflow ctx-input — an explicit binding to a
        // declared ctx key counts as a source, so this node surfaces no
        // problem; the only issue in this demo is the sink's ambiguous input.
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
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
      { id: "b", source: "normB", target: "sink", type: "normal" },
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
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        // Both required inputs bound so the node doesn't carry a red
        // "unsatisfied" auto-wire dot in demos that showcase other features.
        inputs: [
          { port: "documentId", ctxKey: "apimRequestId" },
          { port: "ocrResult", ctxKey: "ocrResult" },
        ],
        ...pos(720, 80),
      },
    },
    edges: [
      { id: "prep-submit", source: "prep", target: "submit", type: "normal" },
      { id: "submit-store", source: "submit", target: "store", type: "normal" },
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
      documentId: { type: "string" },
      apimRequestId: { type: "string" },
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
        bodyExitNodeId: "pollOcr",
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
        outputMappings: [{ port: "preparedData", ctxKey: "ocrResult" }],
        ...pos(460, 200),
      },
      pollOcr: {
        id: "pollOcr",
        type: "pollUntil",
        label: "Wait until condition",
        activityType: "azureOcr.poll",
        condition: {
          operator: "not-equals",
          left: { ref: "ctx.ocrResult.status" },
          right: { literal: "running" },
        },
        interval: "10s",
        maxAttempts: 20,
        initialDelay: "5s",
        timeout: "10m",
        // Bind the poll activity's required input so the node doesn't carry
        // a red "unsatisfied" dot in a demo about control-flow forms.
        inputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(460, 360),
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
        ...pos(460, 520),
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
      { id: "join-store", source: "collect", target: "store", type: "normal" },
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
      {
        id: "route-default",
        source: "routeByType",
        target: "approve",
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
      processedSegments: { type: "array" },
      validationResults: { type: "object" },
      requiresReview: { type: "boolean" },
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
        label: "Fallback handler",
        activityType: "ocr.cleanup",
        // No OcrResult producer upstream (prep emits a Document) — bind
        // explicitly so the demo's fallback node doesn't show a red dot.
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(120, 360),
      },
      reviewSwitch: {
        id: "reviewSwitch",
        type: "switch",
        label: "Route by review flag",
        inputs: [{ port: "requiresReview", ctxKey: "requiresReview" }],
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
        ...pos(460, 120),
      },
      validateFields: {
        id: "validateFields",
        type: "activity",
        label: "Validate Fields",
        activityType: "document.validateFields",
        inputs: [{ port: "processedSegments", ctxKey: "processedSegments" }],
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
        ...pos(820, 120),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(820, 360),
      },
    },
    edges: [
      {
        id: "prep-switch",
        source: "prep",
        target: "reviewSwitch",
        type: "normal",
      },
      {
        id: "prep-fallback",
        source: "prep",
        target: "fallback",
        type: "error",
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
      ocrResult: { type: "object" },
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
        label: "When prepared",
        activityType: "ocr.cleanup",
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(1160, 160),
      },
      whenMissing: {
        id: "whenMissing",
        type: "activity",
        label: "When missing (default)",
        activityType: "ocr.storeResults",
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
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
 * A linear chain pre-organised into two groups with exposed parameters, so
 * grouping (6.2), exposed params (6.4), simplified view (6.3), node-type swap
 * (6.6) and auto-arrange (6.7) can all be exercised from one workflow.
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
      modelId: { type: "string", defaultValue: "prebuilt-layout" },
      confidenceThreshold: { type: "number", defaultValue: 0.7 },
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
        label: "Submit to Azure OCR",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
        outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        ...pos(420, 80),
      },
      store: {
        id: "store",
        type: "activity",
        label: "Store Results",
        activityType: "ocr.storeResults",
        inputs: [
          { port: "documentId", ctxKey: "apimRequestId" },
          { port: "ocrResult", ctxKey: "ocrResult" },
        ],
        ...pos(720, 80),
      },
      cleanup: {
        id: "cleanup",
        type: "activity",
        label: "Cleanup",
        activityType: "ocr.cleanup",
        inputs: [{ port: "ocrResult", ctxKey: "ocrResult" }],
        ...pos(1020, 80),
      },
    },
    edges: [
      { id: "e1", source: "prep", target: "submit", type: "normal" },
      { id: "e2", source: "submit", target: "store", type: "normal" },
      { id: "e3", source: "store", target: "cleanup", type: "normal" },
    ],
    nodeGroups: {
      ocr: {
        label: "OCR Extraction",
        description: "Prepare the file and submit it to Azure OCR.",
        icon: "scan",
        color: "#3b82f6",
        nodeIds: ["prep", "submit"],
        exposedParams: [
          {
            label: "OCR Model",
            path: "ctx.modelId.defaultValue",
            type: "string",
          },
        ],
      },
      finalize: {
        label: "Finalize",
        nodeIds: ["store", "cleanup"],
        exposedParams: [
          {
            label: "Confidence Threshold",
            path: "ctx.confidenceThreshold.defaultValue",
            type: "number",
          },
        ],
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
              kind: "Document",
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
      "Hover a row (or its handle) to see `<name>: <Kind> — <description>` (e.g. `ocrResponse: OcrResult — …`).",
      'Click **Extract** — all 5 of its input rows are visible directly on the card; the old below-node "stacked pill" is gone.',
      'Click **Cleanup** — its single input row and single output row replace the old "arrow" type pill. Here the `ocrResponse` input is auto-satisfied from **Extract** upstream, so its handle stays clean — the amber unsatisfied-ring appears in the Auto-wire demos below (e.g. *Lone Submit*), not here.',
    ],
  },
  {
    key: "autowire",
    title: "Auto-wire — typed input binding states (Part 8)",
    config: autoWireConfig,
    steps: [
      "Select **Submit OCR (auto-bound)** → the Inputs section shows its `fileData` auto-bound to *Prepare* with an **Auto** badge and a **Change source** button. No problems badge.",
      "**Lone Submit (unsatisfied)** carries a **problems badge** (top-left corner, amber) — the unbound input folds into the same per-node validation badge (no separate status dot). The top-bar count reflects it too.",
      "**Click the badge** → it selects the node and opens the input's source picker directly (here it shows the *“add a producer”* guidance, since nothing upstream emits the needed kind).",
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
      "Two Document producers (*Prepare A*, *Normalize B*) both feed **Submit OCR** — the resolver can't choose.",
      '**Submit OCR** carries a **problems badge** (top-left, amber). It also shows in the top-bar count and, via **More ▸** the Validation drawer, as *“Input "Prepared file data" has multiple possible sources — pick one”*.',
      "**Click the badge** → it selects the node and opens the producer picker straight away, listing both *Prepare A* and *Normalize B*. Pick one — the badge clears.",
      "*Normalize B* carries its own badge — a **reachability** warning (it's a second root, not reachable from the entry node). One unified badge per node now folds in auto-wire **and** validation issues; the run-status circle stays in the top-right corner, so they never overlap.",
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
      "Click **Submit to Azure OCR** → the settings panel shows the editable label + a type badge.",
      "Edit the label and blur — the node updates live.",
      "Toggle **Advanced** to reveal the raw port bindings.",
      'In an input binding, type a **new** variable name (e.g. `myNewVar`) → a **+ Create variable "myNewVar"** button appears beneath the field. Click it → the variable is declared and the node binds to it. Without this, saving a binding to an undeclared ctx key fails validation — the button removes the detour to Workflow Settings.',
    ],
  },
  {
    key: "control-flow",
    title: "Control-flow forms & condition editor (Part 4)",
    config: controlFlowConfig,
    steps: [
      "This graph contains **all six** control-flow nodes. Click each to see its hand-rolled settings form:",
      "**Run for each document** (map) → collection/item/index ctx keys, max-concurrency, and body entry/exit node pickers.",
      "**Branch by condition** (switch, a yellow **diamond**) → its **cases** list + per-case **Edge** picker (only *conditional* edges are offered) + a **Default edge**.",
      "In that switch's first case, expand the **condition** — the second case holds a 3-level nested expression `AND( OR(EQ, GTE), NOT(IS-NULL) )` so you can watch the **recursive condition editor** render and toggle a leaf between **Ref** and **Literal**.",
      "**Collect results** (join) → the source-map picker lists **only map nodes**; **Wait until condition** (pollUntil) → activity picker + interval; **Wait for approval** (humanGate) → signal name, timeout, and the **On timeout** control (switch it to *Fallback* to reveal the fallback-edge picker).",
      "**Sub-workflow** (childWorkflow) → toggle **Library / Inline**; this demo ships an inline child graph.",
      "UX polish (Part 16): note the **three-zone top bar** and the switch **diamond** shape; hover a node's output handle to get the **hover-to-extend** popover.",
      "**Kind-aware extend popover:** hover a **typed output port handle** and click the **➕** to extend — the popover is **filtered + ranked** to catalog activities that accept that port's kind (matching consumers float to the top), with a **Show all** escape back to the unfiltered list. Picking a filtered entry drops the node **pre-wired** — it lands with a pinned data wire already connected (drag-to-bind semantics).",
    ],
  },
  {
    key: "edges-validate",
    title: "Switch/error edges & validateFields editor (Part 5)",
    config: edgesValidateConfig,
    steps: [
      "The **Prepare File Data** node has an `errorPolicy` fallback → a red **error edge** (`on error`) runs to **Fallback handler**; normal edges stay grey.",
      "**Route by review flag** (switch) draws **conditional** edges with `case[0]…` / `default` labels.",
      "Click **Validate Fields** → the rich rule editor shows three rule types — **arithmetic**, **field-match** and **array-match** — not an “Unsupported field schema” stub. Change a rule's **type** and confirm `name` is preserved.",
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
    ],
  },
  {
    key: "grouping",
    title: "Grouping, simplified view & node swap (Part 6)",
    config: groupingConfig,
    steps: [
      "This chain ships pre-organised into two groups — **OCR Extraction** and **Finalize** — each with an **exposed parameter**.",
      "Open **More ▸ Simplified view** → each group collapses to a single **chip**; click the **OCR Extraction** chip → **GroupNodeSettings** opens with its label/description/colour and the **Exposed parameters** editor (member node + path + type).",
      "In the exposed-params editor, remove a member node from the group → any exposed param that referenced it is **pruned** with a toast.",
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
    title: "Try-in-place — run a workflow & see previews (Part 9)",
    config: sourcePrepConfig,
    infra: true,
    steps: [
      "Select the **Upload** source node → use **Upload & Try** and pick any PDF/image.",
      "Watch the per-node **run-status badges** go blue → green as the run executes (no Azure needed — this chain just prepares the file).",
      "The **Upload** node renders a **document preview** of what you uploaded.",
      "**Click a data wire** (a coloured port-to-port wire) — a popover pops at the wire midpoint showing the exact value that flowed across it (a kind widget where one exists, else a truncated JSON snippet). Right-clicking the wire offers the same thing via **“View data.”** Click a wire *before* running and it reads **“Run to see the data flowing here.”**",
      "⚠️ Requires the Temporal **worker** + **deno-runner** to be running (the `dev: all` task).",
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
    config: (n) => linearConfig(n),
    kind: "library",
    steps: [
      "This is a **library** workflow (a reusable building block, not a top-level runnable).",
      "Open the workflows list and switch to the **Library** view/kind — this entry appears there.",
      "In another workflow you can drop a **Child workflow** node and pick this from the Library picker.",
    ],
  },
];

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
 * @description Uppercases the documentUrl field.
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  ctx: { document: Document },
  _params: Record<string, unknown>,
): Promise<{ result: { url: string } }> {
  const url = String((ctx.document as { url?: string }).url ?? "");
  return { result: { url: url.toUpperCase() } };
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
        label: "Uppercase URL (custom)",
        activityType: `dyn.${slugName}`,
        // The dynamic-node binding walk requires the required `document`
        // input to be explicitly bound (auto-wire doesn't cover dyn nodes).
        inputs: [{ port: "document", ctxKey: "preparedFileData" }],
        ...pos(460, 140),
      },
    },
    edges: [{ id: "e1", source: "prep", target: "dynNode", type: "normal" }],
  };
}

const DYN_DEMO_STEPS = [
  "The **CUSTOM** section of the activity palette lists **demo-uppercase** with a **DYN** badge — click it to drop another instance.",
  "The canvas node carries a purple **DYN** pill; select it → the Inputs section shows its `document` port bound to *Prepare*'s output.",
  "Right-click the node → **Edit script** opens the script editor with the published TypeScript source (JSDoc `@inputs`/`@outputs` drive the ports).",
  "**+ New custom node** (palette) opens the authoring editor — publishing runs the jsdoc → signature → ts-check → allowlist gates (`MANUAL_TEST_PLAN.md` Part 14).",
  "**Delete + re-create restores the node:** delete this custom node (**Dynamic nodes** page), then **+ New custom node** and publish the *same* name — it comes back with its history continued (v2), instead of dead-ending on a reserved-slug conflict (14.14).",
  "⚠️ *Executing* this node in a run additionally needs the Temporal worker started with `PLATFORM_API_KEY` (14.9).",
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
    await api("PUT", `/api/workflows/${created.id}`, {
      name,
      config: withArrangeOnLoad(demo.secondVersion(name)),
      groupId: GROUP_ID,
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

  const mainReversed = [];
  for (let i = DEMOS.length - 1; i >= 0; i--) {
    mainReversed.push(await createDemo(DEMOS[i]));
  }
  const mainResults = mainReversed.reverse();

  return dynResult ? [...mainResults, dynResult] : mainResults;
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
      "> The chat log opens for the **signed-in user the demos were seeded" +
        " for** (`SEED_USER_SUB`). Conversations are private per user, so if" +
        " you're signed in as someone else, re-run `npm run seed:demos` as" +
        " that identity. The transcript replays as it happened — including the" +
        " agent's own end-to-end self-test against the built-in sample" +
        " document.",
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
  const dynSeeded = results.some((r) => r.dyn);
  lines.push(
    "_Not seeded here because they need a live worker" +
      (dynSeeded ? "" : ", the deno-runner") +
      " or LLM credentials: real OCR output previews + incremental cache-hit" +
      " re-runs (Part 9 run-time), dynamic-node " +
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
 * stable across reseeds, and `createdBy` is the actor the seeded x-api-key
 * resolves to (so the demo session — which sends that key — can open it).
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
    // Own the demo conversations as the identity that will VIEW them.
    // Conversations are private per `createdBy`, so this must match the
    // caller the demo session resolves to:
    //   • A human browsing via IDIR → the SEED_USER_SUB user's actor
    //     (seed.ts upserts that user into the group). This is the primary
    //     path — the FEATURE_DEMO_GUIDE links are opened in a real browser.
    //   • CI / e2e (x-api-key) → the group's ApiKey actor (fallback).
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
        },
        create: {
          id: fx.conversationId,
          workflowId: created.id,
          groupId: GROUP_ID,
          createdBy,
          provider: fx.provider,
          model: fx.model,
          title: fx.title,
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
