import { type ToolSet, tool } from "ai";
import { z } from "zod";
import type { DynamicNodesService } from "@/dynamic-nodes/dynamic-nodes.service";
import type {
  GraphNode,
  GraphWorkflowConfig,
} from "@/workflow/graph-workflow-types";
import type { WorkflowService } from "@/workflow/workflow.service";

/**
 * Per-request context the tool registry binds to. Holds the calling
 * identity (actorId + groupId), service references resolved from Nest
 * DI, the backend base URL for self-calls to Phase 4 controller-only
 * endpoints, and the API key used for those self-calls.
 */
export interface AgentToolContext {
  actorId: string;
  groupId: string;
  workflowId: string | null;
  apiKey: string | null;
  backendBaseUrl: string;
  workflowService: WorkflowService;
  dynamicNodesService: DynamicNodesService;
  /**
   * Hook the agent service registers so it can rebind the conversation's
   * `workflowId` when the agent's first `createWorkflow` lands.
   */
  onWorkflowCreated?: (workflowId: string) => void | Promise<void>;
}

interface InternalApiResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T | { error?: string; message?: string };
}

/**
 * Internal HTTP self-call to the backend's own controllers. Used for
 * endpoints that only live in controllers (Phase 4 run / status /
 * preview-cache). Carries the agent's API key so authentication
 * round-trips correctly.
 */
async function internalFetch<T>(
  ctx: AgentToolContext,
  path: string,
  init?: RequestInit,
): Promise<InternalApiResult<T>> {
  if (ctx.apiKey === null) {
    return {
      ok: false,
      status: 401,
      body: {
        error: "no-api-key",
        message: "Backend has no API key for self-calls.",
      },
    };
  }
  const url = ctx.backendBaseUrl.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    ...init,
    headers: {
      "x-api-key": ctx.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body: body as T };
}

interface PartialNodeInput {
  id: string;
  type: string;
  name?: string;
  parameters?: Record<string, unknown>;
  position?: { x: number; y: number };
  inputBindings?: Array<{ port: string; ctxKey: string }>;
  isInput?: boolean;
}

function ensureNonNullWorkflowId(
  ctx: AgentToolContext,
  workflowId: string | undefined,
): string {
  const resolved = workflowId ?? ctx.workflowId;
  if (resolved === null || resolved === undefined) {
    throw new Error(
      "No workflowId provided and no workflow bound to this conversation.",
    );
  }
  return resolved;
}

async function readWorkflow(
  ctx: AgentToolContext,
  workflowId: string,
): Promise<GraphWorkflowConfig> {
  const wf = await ctx.workflowService.getWorkflow(workflowId, ctx.actorId);
  return wf.config;
}

async function writeWorkflow(
  ctx: AgentToolContext,
  workflowId: string,
  config: GraphWorkflowConfig,
): Promise<void> {
  await ctx.workflowService.updateWorkflow(workflowId, ctx.actorId, { config });
}

/**
 * Build the AI SDK `ToolSet` bound to the request context. Returned
 * tools have closures around the per-request services + identity.
 */
export function createAgentTools(ctx: AgentToolContext): ToolSet {
  return {
    listActivityCatalog: tool({
      description:
        "List every activity available in the calling group: built-in static activities plus published dynamic nodes. Always call this before composing a workflow.",
      inputSchema: z.object({}),
      execute: async () => {
        const entries = await ctx.dynamicNodesService.getMergedCatalogForGroup(
          ctx.groupId,
        );
        return {
          ok: true,
          count: entries.length,
          activities: entries.map((e) => ({
            activityType: e.activityType,
            displayName: e.displayName,
            description: e.description,
            category: e.category,
            inputs: e.inputs,
            outputs: e.outputs,
            isDynamic: Boolean(e.dynamicNodeSlug),
          })),
        };
      },
    }),

    listLibraryWorkflows: tool({
      description:
        "List reusable library workflows in the calling group. Each library workflow exposes typed inputs and outputs and can be embedded as a `childWorkflow` node.",
      inputSchema: z.object({}),
      execute: async () => {
        const lineages = await ctx.workflowService.getGroupWorkflows(
          [ctx.groupId],
          { kind: "library" },
        );
        return {
          ok: true,
          count: lineages.length,
          libraries: lineages.map((l) => ({
            id: l.id,
            name: l.name,
            description: l.description,
            slug: l.slug,
            metadataInputs: l.config?.metadata?.inputs ?? [],
            metadataOutputs: l.config?.metadata?.outputs ?? [],
          })),
        };
      },
    }),

    getWorkflow: tool({
      description:
        "Read the full current configuration of a workflow lineage: nodes, edges, ctx declarations, entryNodeId, metadata.",
      inputSchema: z.object({
        workflowId: z
          .string()
          .optional()
          .describe(
            "Workflow lineage id. Defaults to the conversation's currently-bound workflow.",
          ),
      }),
      execute: async ({ workflowId }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const wf = await ctx.workflowService.getWorkflow(id, ctx.actorId);
        return {
          ok: true,
          workflow: {
            id: wf.id,
            name: wf.name,
            description: wf.description,
            slug: wf.slug,
            config: wf.config,
            version: wf.version,
          },
        };
      },
    }),

    createWorkflow: tool({
      description:
        "Create a new workflow in the calling group, pre-seeded with a `source.upload` node as the entry point. The conversation auto-binds to the new workflow id so subsequent tool calls (addNode, connectNodes, etc.) target it.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        entryNodeId: z
          .string()
          .optional()
          .describe(
            "ID for the auto-seeded source.upload entry node. Defaults to `upload1`.",
          ),
      }),
      execute: async ({ name, description, entryNodeId }) => {
        const uploadId = entryNodeId ?? "upload1";
        const seedNode: GraphNode = {
          id: uploadId,
          type: "source",
          sourceType: "source.upload",
          name: "Upload",
          parameters: {},
          position: { x: 100, y: 100 },
          inputBindings: [],
        } as unknown as GraphNode;
        const created = await ctx.workflowService.createWorkflow(ctx.actorId, {
          name,
          description,
          groupId: ctx.groupId,
          config: {
            schemaVersion: "1.0",
            metadata: { name },
            nodes: { [uploadId]: seedNode },
            edges: [],
            entryNodeId: uploadId,
            ctx: {},
          } as unknown as GraphWorkflowConfig,
        });
        if (ctx.onWorkflowCreated) {
          await ctx.onWorkflowCreated(created.id);
        }
        return {
          ok: true,
          workflow: {
            id: created.id,
            name: created.name,
            slug: created.slug,
            entryNodeId: uploadId,
            seedNodeType: "source.upload",
          },
        };
      },
    }),

    updateWorkflowMetadata: tool({
      description:
        "Update a workflow's name or description (no graph changes). For node-level edits use the addNode/setNodeParameters/connectNodes/deleteNode tools.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
      }),
      execute: async ({ workflowId, name, description }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const patch: { name?: string; description?: string } = {};
        if (name !== undefined) patch.name = name;
        if (description !== undefined) patch.description = description;
        const updated = await ctx.workflowService.updateWorkflow(
          id,
          ctx.actorId,
          patch,
        );
        return { ok: true, workflow: { id: updated.id, name: updated.name } };
      },
    }),

    addNode: tool({
      description:
        "Add a node to a workflow's graph. The node's `type` must come from `listActivityCatalog`. Positions default to a free spot if omitted.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        node: z.object({
          id: z
            .string()
            .min(1)
            .describe("Unique id for this node within the workflow."),
          type: z
            .string()
            .min(1)
            .describe(
              "Activity type, e.g. `document.split`, `source.upload`, or `dyn.<slug>`.",
            ),
          name: z.string().optional(),
          parameters: z.record(z.string(), z.unknown()).optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
          inputBindings: z
            .array(z.object({ port: z.string(), ctxKey: z.string() }))
            .optional(),
          isInput: z.boolean().optional(),
        }),
      }),
      execute: async ({ workflowId, node }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const config = await readWorkflow(ctx, id);
        const existingNodes = config.nodes ?? {};
        if (existingNodes[node.id] !== undefined) {
          return {
            ok: false,
            error: {
              code: "duplicate-node-id",
              message: `A node with id '${node.id}' already exists in this workflow.`,
            },
          };
        }
        const partial = node as PartialNodeInput;
        const nodeCount = Object.keys(existingNodes).length;
        // The agent passes `type` as the activity-catalog or source-catalog
        // identifier (e.g. "file.prepare", "source.upload", "dyn.<slug>").
        // The schema requires a discriminator `type` of "activity" |
        // "source" | "dyn" etc. Resolve here so the agent doesn't need to
        // know the internal node shape.
        const requestedType = partial.type;
        const shapeFields = (() => {
          if (requestedType.startsWith("source.")) {
            return { type: "source", sourceType: requestedType };
          }
          if (requestedType.startsWith("dyn.")) {
            return { type: "activity", activityType: requestedType };
          }
          // Default: treat as an activity (works for both static catalog
          // entries and any other activity-catalog `<verb>.<noun>` shape).
          return { type: "activity", activityType: requestedType };
        })();
        const newNode: GraphNode = {
          id: partial.id,
          ...shapeFields,
          name: partial.name ?? partial.id,
          parameters: partial.parameters ?? {},
          position: partial.position ?? autoPosition(nodeCount),
          inputBindings: partial.inputBindings ?? [],
          ...(partial.isInput ? { isInput: true } : {}),
        } as unknown as GraphNode;
        const nextConfig: GraphWorkflowConfig = {
          ...config,
          nodes: { ...existingNodes, [node.id]: newNode },
          // If this is the first node and no entry has been set, default
          // entryNodeId to the new node so the workflow is runnable.
          entryNodeId:
            config.entryNodeId && config.entryNodeId.length > 0
              ? config.entryNodeId
              : partial.id,
        };
        try {
          await writeWorkflow(ctx, id, nextConfig);
        } catch (err) {
          return wrapWriteError("addNode", err);
        }
        return { ok: true, node: newNode };
      },
    }),

    setNodeParameters: tool({
      description:
        "Replace a node's parameters object. The full new object is written; missing keys are removed.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        nodeId: z.string(),
        parameters: z.record(z.string(), z.unknown()),
      }),
      execute: async ({ workflowId, nodeId, parameters }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const config = await readWorkflow(ctx, id);
        const existing = config.nodes?.[nodeId];
        if (existing === undefined) {
          return {
            ok: false,
            error: {
              code: "not-found",
              message: `Node '${nodeId}' not found.`,
            },
          };
        }
        const nextNodes = {
          ...(config.nodes ?? {}),
          [nodeId]: { ...existing, parameters } as GraphNode,
        };
        try {
          await writeWorkflow(ctx, id, { ...config, nodes: nextNodes });
        } catch (err) {
          return wrapWriteError("setNodeParameters", err);
        }
        return { ok: true };
      },
    }),

    connectNodes: tool({
      description:
        "Add an edge between two nodes. Optionally add an input binding on the target node so the typed I/O validator can verify the connection.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        sourceNodeId: z.string(),
        targetNodeId: z.string(),
        binding: z
          .object({ port: z.string(), ctxKey: z.string() })
          .optional()
          .describe(
            "Optional input binding to add to the target node: maps an input port to the ctx key produced upstream.",
          ),
      }),
      execute: async ({ workflowId, sourceNodeId, targetNodeId, binding }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const config = await readWorkflow(ctx, id);
        const nodes = config.nodes ?? {};
        if (nodes[sourceNodeId] === undefined) {
          return {
            ok: false,
            error: {
              code: "not-found",
              message: `Source node '${sourceNodeId}' not found.`,
            },
          };
        }
        if (nodes[targetNodeId] === undefined) {
          return {
            ok: false,
            error: {
              code: "not-found",
              message: `Target node '${targetNodeId}' not found.`,
            },
          };
        }
        const edges = [
          ...(config.edges ?? []),
          { source: sourceNodeId, target: targetNodeId },
        ];
        let nextNodes = nodes;
        if (binding !== undefined) {
          const target = nodes[targetNodeId];
          const existingBindings =
            (
              target as {
                inputBindings?: Array<{ port: string; ctxKey: string }>;
              }
            ).inputBindings ?? [];
          nextNodes = {
            ...nodes,
            [targetNodeId]: {
              ...target,
              inputBindings: [
                ...existingBindings.filter((b) => b.port !== binding.port),
                binding,
              ],
            } as GraphNode,
          };
        }
        try {
          await writeWorkflow(ctx, id, { ...config, edges, nodes: nextNodes });
        } catch (err) {
          return wrapWriteError("connectNodes", err);
        }
        return { ok: true };
      },
    }),

    deleteNode: tool({
      description:
        "Remove a node from a workflow. Cascades: removes any edges with this node as endpoint and clears entryNodeId if it pointed here.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        nodeId: z.string(),
      }),
      execute: async ({ workflowId, nodeId }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const config = await readWorkflow(ctx, id);
        const nodes = config.nodes ?? {};
        if (nodes[nodeId] === undefined) {
          return {
            ok: false,
            error: {
              code: "not-found",
              message: `Node '${nodeId}' not found.`,
            },
          };
        }
        const { [nodeId]: _removed, ...remainingNodes } = nodes;
        const nextConfig: GraphWorkflowConfig = {
          ...config,
          nodes: remainingNodes,
          edges: (config.edges ?? []).filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          ),
          entryNodeId: config.entryNodeId === nodeId ? "" : config.entryNodeId,
        };
        try {
          await writeWorkflow(ctx, id, nextConfig);
        } catch (err) {
          return wrapWriteError("deleteNode", err);
        }
        return { ok: true };
      },
    }),

    setEntryNode: tool({
      description:
        "Set the workflow's entry node id (the node that runs first). Pass null to clear.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        nodeId: z.string().nullable(),
      }),
      execute: async ({ workflowId, nodeId }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const config = await readWorkflow(ctx, id);
        const nodes = config.nodes ?? {};
        if (nodeId !== null && nodes[nodeId] === undefined) {
          return {
            ok: false,
            error: {
              code: "not-found",
              message: `Node '${nodeId}' not found.`,
            },
          };
        }
        try {
          await writeWorkflow(ctx, id, {
            ...config,
            entryNodeId: nodeId ?? "",
          });
        } catch (err) {
          return wrapWriteError("setEntryNode", err);
        }
        return { ok: true };
      },
    }),

    declareCtx: tool({
      description:
        "Declare a ctx (blackboard) key on the workflow. Optionally type it with a `kind` from the typed I/O registry, and flag it as input/output.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        key: z.string().min(1),
        kind: z.string().optional(),
        isInput: z.boolean().optional(),
        isOutput: z.boolean().optional(),
        description: z.string().optional(),
      }),
      execute: async ({
        workflowId,
        key,
        kind,
        isInput,
        isOutput,
        description,
      }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const config = await readWorkflow(ctx, id);
        const next = {
          ...config,
          ctx: {
            ...(config.ctx ?? {}),
            [key]: {
              ...(kind !== undefined ? { kind } : {}),
              ...(isInput !== undefined ? { isInput } : {}),
              ...(isOutput !== undefined ? { isOutput } : {}),
              ...(description !== undefined ? { description } : {}),
            },
          },
        };
        try {
          await writeWorkflow(ctx, id, next as GraphWorkflowConfig);
        } catch (err) {
          return wrapWriteError("declareCtx", err);
        }
        return { ok: true };
      },
    }),

    listDynamicNodes: tool({
      description:
        "List the calling group's published custom dynamic nodes (user-authored TypeScript activities).",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await internalFetch(ctx, "/api/dynamic-nodes");
        return result.ok
          ? { ok: true, ...(result.body as object) }
          : { ok: false, error: result.body };
      },
    }),

    publishDynamicNode: tool({
      description:
        "Publish a new dynamic node (or a new version if a lineage with the same slug exists). The script must include a JSDoc header declaring `@name`, `@inputs`, `@outputs`. The slug is extracted from `@name`.",
      inputSchema: z.object({
        script: z
          .string()
          .min(20)
          .describe(
            "Full TypeScript source including the JSDoc signature header. See the dynamic-node design doc for the schema.",
          ),
      }),
      execute: async ({ script }) => {
        const result = await internalFetch<{ slug?: string }>(
          ctx,
          "/api/dynamic-nodes",
          { method: "POST", body: JSON.stringify({ script }) },
        );
        if (result.ok) return { ok: true, ...(result.body as object) };
        // If 409 (slug exists), retry as PUT to publish a new version.
        if (result.status === 409) {
          const parsed = script.match(/@name\s+([a-z][a-z0-9-]*)/);
          if (parsed) {
            const slug = parsed[1];
            const putResult = await internalFetch(
              ctx,
              `/api/dynamic-nodes/${slug}`,
              { method: "PUT", body: JSON.stringify({ script }) },
            );
            return putResult.ok
              ? { ok: true, ...(putResult.body as object) }
              : { ok: false, error: putResult.body };
          }
        }
        return { ok: false, error: result.body };
      },
    }),

    deleteDynamicNode: tool({
      description: "Soft-delete a published dynamic node by slug.",
      inputSchema: z.object({ slug: z.string() }),
      execute: async ({ slug }) => {
        const result = await internalFetch(ctx, `/api/dynamic-nodes/${slug}`, {
          method: "DELETE",
        });
        return result.ok
          ? { ok: true, ...(result.body as object) }
          : { ok: false, error: result.body };
      },
    }),

    startRun: tool({
      description:
        "Start a workflow run. Returns a runId immediately; poll getNodeStatuses + getPreviewCache to observe progress.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        initialCtx: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async ({ workflowId, initialCtx }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const result = await internalFetch(ctx, `/api/workflows/${id}/runs`, {
          method: "POST",
          body: JSON.stringify({ initialCtx: initialCtx ?? {} }),
        });
        return result.ok
          ? { ok: true, ...(result.body as object) }
          : { ok: false, error: result.body };
      },
    }),

    getNodeStatuses: tool({
      description:
        "Get the per-node run status snapshot for a workflow run. Poll this after `startRun` until all nodes reach a terminal status (succeeded or failed).",
      inputSchema: z.object({
        workflowId: z.string().optional(),
        runId: z.string(),
      }),
      execute: async ({ workflowId, runId }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const result = await internalFetch(
          ctx,
          `/api/workflows/${id}/runs/${runId}/node-statuses`,
        );
        return result.ok
          ? { ok: true, statuses: result.body }
          : { ok: false, error: result.body };
      },
    }),

    getPreviewCache: tool({
      description:
        "Get the cached preview outputs for a workflow's most recent run. Use this to read what each node produced and evaluate against the user's goal.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
      }),
      execute: async ({ workflowId }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const result = await internalFetch(
          ctx,
          `/api/workflows/${id}/preview-cache`,
        );
        return result.ok
          ? { ok: true, preview: result.body }
          : { ok: false, error: result.body };
      },
    }),

    getRunSpec: tool({
      description:
        "Get the workflow's run spec — the input schema the workflow expects, including any source.upload spec.",
      inputSchema: z.object({
        workflowId: z.string().optional(),
      }),
      execute: async ({ workflowId }) => {
        const id = ensureNonNullWorkflowId(ctx, workflowId);
        const result = await internalFetch(
          ctx,
          `/api/workflows/${id}/run-spec`,
        );
        return result.ok
          ? { ok: true, runSpec: result.body }
          : { ok: false, error: result.body };
      },
    }),
  };
}

function autoPosition(existingCount: number): { x: number; y: number } {
  const col = existingCount % 4;
  const row = Math.floor(existingCount / 4);
  return { x: 100 + col * 250, y: 100 + row * 150 };
}

function wrapWriteError(
  toolName: string,
  err: unknown,
): { ok: false; error: { code: string; message: string; body?: unknown } } {
  const message = err instanceof Error ? err.message : String(err);
  const body =
    err instanceof Error && "response" in err
      ? (err as { response?: unknown }).response
      : undefined;
  return {
    ok: false,
    error: {
      code: `${toolName}-failed`,
      message,
      ...(body !== undefined ? { body } : {}),
    },
  };
}
