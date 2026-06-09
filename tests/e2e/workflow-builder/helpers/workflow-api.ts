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
        inputs: [{ port: "documentId", ctxKey: "apimRequestId" }],
        ...pos(720, 80),
      },
    },
    edges: [
      { id: "prep-submit", source: "prep", target: "submit", type: "normal" },
      { id: "submit-store", source: "submit", target: "store", type: "normal" },
    ],
  };
}
