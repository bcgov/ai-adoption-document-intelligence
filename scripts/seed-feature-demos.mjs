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
const AGENT_DEMO_FIXTURES = ["scenario-1.json", "scenario-2.json"];
const GUIDE_PATH = resolve(
  __dirname,
  "../docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md",
);

let apiKey = ""; // resolved by resolveApiKey() before any write
const authHeaders = () => ({
  "x-api-key": apiKey,
  "Content-Type": "application/json",
});
const pos = (x, y) => ({ metadata: { position: { x, y } } });

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
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
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
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
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
    ctx: { blobKey: { type: "string" } },
    nodes: {
      prepA: {
        id: "prepA",
        type: "activity",
        label: "Prepare A",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
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
    inputs: [
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
    ctx: { documentUrl: { type: "string" } },
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
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
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
    ctx: { blobKey: { type: "string" } },
    nodes: {
      c1: {
        id: "c1",
        type: "activity",
        label: "Prepare (inline)",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
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
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
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
    ctx: { documentUrl: { type: "string" } },
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
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
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
    title: "Typed I/O — coloured handles & type pills (Part 7)",
    config: typedChainConfig,
    steps: [
      "Look at the node handles: single-typed ports are **coloured**; a node with multiple same-kind outputs (Submit OCR) shows a **grey wildcard** handle.",
      "Hover a handle to see its kind (e.g. `OcrResult`) or the multi-output prompt.",
      "Click **Cleanup** — the settings panel shows an **arrow** type pill (one typed port each side).",
      "Click **Extract** — it shows a **stacked** pill listing all 5 input ports.",
    ],
  },
  {
    key: "autowire",
    title: "Auto-wire — typed input binding states (Part 8)",
    config: autoWireConfig,
    steps: [
      "Select **Submit OCR (auto-bound)** → the Inputs section shows its `fileData` auto-bound to *Prepare* with an **auto** badge and an **Override** button. No problems badge.",
      "**Lone Submit (unsatisfied)** carries a **problems badge** (top-left corner, amber) — the unbound input folds into the same per-node validation badge (no separate status dot). The top-bar count reflects it too.",
      "**Click the badge** → it selects the node and opens the input's source picker directly (here it shows the *“add a producer”* guidance, since nothing upstream emits the needed kind).",
      "On the auto-bound node, click **Override** → the binding locks; click **Revert to auto** to restore it.",
    ],
  },
  {
    key: "ambiguous",
    title: "Auto-wire — ambiguous source picker (Part 8)",
    config: ambiguousConfig,
    steps: [
      "Two Document producers (*Prepare A*, *Normalize B*) both feed **Submit OCR** — the resolver can't choose.",
      "**Submit OCR** carries a **problems badge** (top-left, amber). It also shows in the top-bar count and, via **More ▸** the Validation drawer, as *“Input fileData has an ambiguous source”*.",
      "**Click the badge** → it selects the node and opens the producer picker straight away, listing both *Prepare A* and *Normalize B*. Pick one — the badge clears.",
      "*Normalize B* carries its own badge — a **reachability** warning (it's a second root, not reachable from the entry node). One unified badge per node now folds in auto-wire **and** validation issues; the run-status circle stays in the top-right corner, so they never overlap.",
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
      preparedFileData: { type: "object" },
    },
    nodes: {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
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

async function seed() {
  console.log(`Seeding feature demos → ${BACKEND_URL} (group ${GROUP_ID})`);
  const removed = await deleteExistingDemos();
  if (removed) console.log(`  cleared ${removed} previous demo(s)`);

  const results = [];
  for (const demo of DEMOS) {
    const name = `${NAME_PREFIX}${demo.title}`;
    const config =
      typeof demo.config === "function" ? demo.config(name) : demo.config;
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
        config: demo.secondVersion(name),
        groupId: GROUP_ID,
      });
    }
    results.push({ ...demo, id: created.id, slug: created.slug });
    console.log(`  ✓ ${demo.key.padEnd(14)} ${created.id}`);
  }

  // Best-effort dynamic-node demo (Part 14) — see publishDemoDynamicNode.
  const dynSlug = await publishDemoDynamicNode();
  if (dynSlug) {
    const title =
      "Dynamic (custom-code) node — DYN pill & script editor (Part 14)";
    const name = `${NAME_PREFIX}${title}`;
    const created = unwrap(
      await api("POST", "/api/workflows", {
        name,
        config: dynamicNodeConfig(name, dynSlug),
        groupId: GROUP_ID,
      }),
    );
    results.push({
      key: "dynamic-node",
      title,
      steps: DYN_DEMO_STEPS,
      id: created.id,
      slug: created.slug,
      dyn: true,
    });
    console.log(
      `  ✓ ${"dynamic-node".padEnd(14)} ${created.id} (dyn.${dynSlug})`,
    );
  }

  return results;
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
  // Agent chat-log deep link: opens the drawer and replays the seeded
  // conversation. The conversation id is fixed by the fixture, so stable.
  const chatLink = (r) => `${FRONTEND_URL}/?agentChat=${r.convId}`;
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
    lines.push(`- [${r.title}](#${slug(r.title)})`);
  }
  if (agentResults.length > 0) {
    lines.push("- [🤖 AI agent chat logs](#-ai-agent-chat-logs)");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const r of results) {
    lines.push(`## ${r.title}`);
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
        " (Azure gpt-5.4). Open a chat-log link — the agent drawer opens and" +
        " **replays** the whole conversation (your prompt + every tool call" +
        " the agent made) so you can watch how the workflow was built. The" +
        " workflow link opens the graph the agent produced.",
    );
    lines.push("");
    for (const r of agentResults) {
      lines.push(`### ${r.title}`);
      lines.push("");
      lines.push(`**💬 Chat log:** [${chatLink(r)}](${chatLink(r)})`);
      lines.push("");
      lines.push(`**▶ Workflow:** [${link(r)}](${link(r)})`);
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
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const results = [];
  try {
    // ApiKey.group_id is unique — one key per group. Its actor is what an
    // x-api-key request for this group authenticates as.
    const key = await prisma.apiKey.findUnique({
      where: { group_id: GROUP_ID },
      select: { actor_id: true },
    });
    if (!key) {
      console.log(
        `  ! skipped agent demos — no API key actor for group ${GROUP_ID}`,
      );
      return results;
    }
    const createdBy = key.actor_id;

    for (const file of AGENT_DEMO_FIXTURES) {
      const fx = JSON.parse(
        readFileSync(resolve(__dirname, "agent-demo-fixtures", file), "utf-8"),
      );
      const created = unwrap(
        await api("POST", "/api/workflows", {
          name: fx.workflow.name,
          description: fx.workflow.description,
          config: fx.workflow.config,
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
