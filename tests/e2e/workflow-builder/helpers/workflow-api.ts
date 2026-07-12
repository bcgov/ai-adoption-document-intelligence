import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { APIRequestContext, expect } from "@playwright/test";
import { BACKEND_URL, SEED_GROUP_ID, TEST_API_KEY } from "./wb-test";

/**
 * Thin backend-API client for building workflow fixtures directly, bypassing
 * the canvas UI. This is the backbone of the Tier-2 canvas tests: we POST a
 * known graph, open it in the editor, and assert the RENDER — far more reliable
 * than simulating React Flow drag-to-connect for every edge.
 */

const headers = {
  "x-api-key": TEST_API_KEY,
  "Content-Type": "application/json",
};

export interface WfNodeInput {
  port: string;
  ctxKey: string;
}

export interface WfNode {
  id: string;
  type: string;
  label?: string;
  activityType?: string;
  inputs?: WfNodeInput[];
  outputs?: { port: string; ctxKey: string }[];
  metadata?: { position?: { x: number; y: number } };
  [k: string]: unknown;
}

export interface WfEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  condition?: string;
}

export interface GraphConfig {
  schemaVersion: string;
  metadata: { name: string; description?: string; kind?: string };
  entryNodeId: string;
  ctx: Record<string, unknown>;
  nodes: Record<string, WfNode>;
  edges: WfEdge[];
  nodeGroups?: Record<string, unknown>;
}

export interface CreatedWorkflow {
  id: string;
  name: string;
  slug: string;
}

/** POST /api/workflows — returns the created workflow. */
export async function createWorkflow(
  request: APIRequestContext,
  opts: {
    name: string;
    config: GraphConfig;
    kind?: "workflow" | "library";
    description?: string;
  },
): Promise<CreatedWorkflow> {
  const res = await request.post(`${BACKEND_URL}/api/workflows`, {
    headers,
    data: {
      name: opts.name,
      description: opts.description,
      config: opts.config,
      groupId: SEED_GROUP_ID,
      kind: opts.kind,
    },
  });
  expect(
    res.ok(),
    `create workflow failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  // POST returns the created row wrapped as { workflow: {...} }.
  const body = (await res.json()) as
    | CreatedWorkflow
    | { workflow: CreatedWorkflow };
  return "workflow" in body ? body.workflow : body;
}

export async function getWorkflow(
  request: APIRequestContext,
  id: string,
): Promise<{ id: string; name: string; config: GraphConfig }> {
  const res = await request.get(`${BACKEND_URL}/api/workflows/${id}`, {
    headers,
  });
  expect(res.ok(), `get workflow ${id} failed: ${res.status()}`).toBeTruthy();
  type Single = { id: string; name: string; config: GraphConfig };
  const body = (await res.json()) as Single | { workflow: Single };
  return "workflow" in body ? body.workflow : body;
}

export async function deleteWorkflow(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`${BACKEND_URL}/api/workflows/${id}`, { headers });
}

/** PUT /api/workflows/:id — publishes a new version on the lineage. */
export async function updateWorkflow(
  request: APIRequestContext,
  id: string,
  opts: { name: string; config: GraphConfig },
): Promise<void> {
  const res = await request.put(`${BACKEND_URL}/api/workflows/${id}`, {
    headers,
    data: { name: opts.name, config: opts.config, groupId: SEED_GROUP_ID },
  });
  expect(
    res.ok(),
    `update workflow failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
}

/** Minimal shape of a run-spec response (see `RunSpecResponseDto`). */
export interface RunSpec {
  triggerUrl: string;
  inputSchema: { type: string; properties: Record<string, unknown> };
  authNotes: string;
  sampleCurl: string;
  uploadSpec?: unknown;
}

/** GET /api/workflows/:id/run-spec — returns the raw status + parsed body. */
export async function getRunSpec(
  request: APIRequestContext,
  id: string,
): Promise<{ status: number; body: RunSpec }> {
  const res = await request.get(`${BACKEND_URL}/api/workflows/${id}/run-spec`, {
    headers,
  });
  return { status: res.status(), body: (await res.json()) as RunSpec };
}

export interface WorkflowVersionSummary {
  id: string;
  versionNumber: number;
}

/** GET /api/workflows/:id/versions — newest-first version summaries. */
export async function listWorkflowVersions(
  request: APIRequestContext,
  id: string,
): Promise<WorkflowVersionSummary[]> {
  const res = await request.get(`${BACKEND_URL}/api/workflows/${id}/versions`, {
    headers,
  });
  expect(res.ok(), `list versions failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { versions: WorkflowVersionSummary[] };
  return body.versions;
}

/** POST /api/workflows/:id/revert-head — returns the raw status. */
export async function revertHead(
  request: APIRequestContext,
  id: string,
  workflowVersionId: string,
): Promise<number> {
  const res = await request.post(
    `${BACKEND_URL}/api/workflows/${id}/revert-head`,
    { headers, data: { workflowVersionId } },
  );
  return res.status();
}

/** Terminal per-node run statuses (anything not still pending/running). */
const TERMINAL_STATUSES = ["succeeded", "skipped", "failed", "cancelled"];

export interface NodeRunStatus {
  status: "pending" | "running" | "succeeded" | "skipped" | "failed";
  startedAt?: string;
  endedAt?: string;
  errorMessage?: string;
  cacheHit?: { configHash: string; inputHash: string };
}

/**
 * POST a file to a `source.upload` node — uploads to blob storage AND kicks off
 * a Temporal Try run (US-146). Returns the run id and the blob key the upload
 * wrote to the source node's ctxKey (default `documentUrl`), so a follow-up run
 * can be started with the SAME input.
 */
export async function uploadToSource(
  request: APIRequestContext,
  workflowId: string,
  sourceNodeId: string,
  filePath: string,
  ctxKey = "documentUrl",
): Promise<{ runId: string; blobKey: string }> {
  const res = await request.post(
    `${BACKEND_URL}/api/workflows/${workflowId}/sources/${sourceNodeId}/upload`,
    {
      headers: { "x-api-key": TEST_API_KEY },
      multipart: {
        file: {
          name: basename(filePath),
          mimeType: "application/pdf",
          buffer: readFileSync(filePath),
        },
      },
    },
  );
  expect(
    res.ok(),
    `upload to source failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  const body = (await res.json()) as Record<string, string>;
  return { runId: body.runId, blobKey: body[ctxKey] };
}

/** POST /api/workflows/:id/runs — start a Temporal run with `initialCtx`. */
export async function startRun(
  request: APIRequestContext,
  workflowId: string,
  initialCtx: Record<string, unknown>,
): Promise<string> {
  const res = await request.post(
    `${BACKEND_URL}/api/workflows/${workflowId}/runs`,
    { headers, data: { initialCtx } },
  );
  expect(
    res.ok(),
    `start run failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  return ((await res.json()) as { workflowId: string }).workflowId;
}

/**
 * Poll `GET /:id/runs/:runId/node-statuses` until every node in `nodeIds`
 * reaches a terminal status, then return the full status map.
 */
export async function pollNodeStatusesUntilDone(
  request: APIRequestContext,
  workflowId: string,
  runId: string,
  nodeIds: string[],
  timeoutMs = 30_000,
): Promise<Record<string, NodeRunStatus>> {
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, NodeRunStatus> = {};
  while (Date.now() < deadline) {
    const res = await request.get(
      `${BACKEND_URL}/api/workflows/${workflowId}/runs/${runId}/node-statuses`,
      { headers },
    );
    if (res.ok()) {
      last = (await res.json()) as Record<string, NodeRunStatus>;
      const done = nodeIds.every(
        (n) => last[n] && TERMINAL_STATUSES.includes(last[n].status),
      );
      if (done) return last;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `node-statuses did not reach terminal for [${nodeIds.join(", ")}] within ${timeoutMs}ms; last=${JSON.stringify(last)}`,
  );
}

export async function listWorkflows(
  request: APIRequestContext,
  query = "",
): Promise<Array<{ id: string; name: string; kind?: string }>> {
  const res = await request.get(
    `${BACKEND_URL}/api/workflows?limit=100${query}`,
    {
      headers,
    },
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return Array.isArray(body) ? body : (body.data ?? body.items ?? []);
}

/**
 * A single-source-node workflow (source.upload entry). The source palette/seed
 * normally injects this node; building it directly lets us exercise the source
 * settings panel without driving the palette.
 */
export function buildSourceConfig(name = "e2e source"): GraphConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name },
    entryNodeId: "upload1",
    ctx: {
      blobKey: { type: "string" },
      fileName: { type: "string" },
    },
    nodes: {
      upload1: {
        id: "upload1",
        // Source nodes discriminate on type "source" + a `sourceType` subtype.
        type: "source",
        sourceType: "source.upload",
        label: "Upload",
        outputs: [
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        metadata: { position: { x: 120, y: 300 } },
      },
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare File Data",
        activityType: "file.prepare",
        inputs: [
          { port: "blobKey", ctxKey: "blobKey" },
          { port: "fileName", ctxKey: "fileName" },
        ],
        metadata: { position: { x: 420, y: 300 } },
      },
    },
    edges: [
      { id: "upload1-prep", source: "upload1", target: "prep", type: "normal" },
    ],
  };
}

/**
 * A minimal three-node linear activity chain. `withPositions: false` (default)
 * omits every `metadata.position` — this is the shape the seed workflows ship
 * in, and the input the edit-mode auto-layout fix must handle.
 */
export function buildLinearConfig(opts?: {
  name?: string;
  withPositions?: boolean;
}): GraphConfig {
  const name = opts?.name ?? "e2e linear";
  const pos = (x: number, y: number) =>
    opts?.withPositions ? { metadata: { position: { x, y } } } : {};

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
        // Bind BOTH required inputs (documentId + the typed OcrResult) so the
        // node has no auto-wire "needs a source" warning — those now fold into
        // the unified validation surface.
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
