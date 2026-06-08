import {
  normaliseLocks,
  resolveBindings,
  SOURCE_CATALOG,
  stripRedundantLocks,
} from "@ai-di/graph-workflow";
import type { ToolSet } from "ai";
import type { DynamicNodesService } from "@/dynamic-nodes/dynamic-nodes.service";
import type {
  GraphNode,
  GraphWorkflowConfig,
} from "@/workflow/graph-workflow-types";
import type { WorkflowService } from "@/workflow/workflow.service";
import {
  type AgentToolContext,
  createAgentTools,
  resolveConfigForPersist,
  wrapToolData,
} from "./tools";

// ── Test helpers ────────────────────────────────────────────────────

/** Minimal AI SDK tool-call execution wrapper. */
function exec<T>(
  tools: ToolSet,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const t = tools[name];
  if (t === undefined) throw new Error(`tool ${name} not registered`);
  const fn = t.execute as (a: unknown, o: unknown) => Promise<T>;
  return fn(args, {
    toolCallId: "tc1",
    messages: [],
  });
}

function emptyConfig(
  overrides: Partial<GraphWorkflowConfig> = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "wf" },
    nodes: {},
    edges: [],
    entryNodeId: "",
    ctx: {},
    ...overrides,
  };
}

interface FakeWorkflowState {
  config: GraphWorkflowConfig;
}

function makeCtx(
  overrides: Partial<AgentToolContext> = {},
): {
  ctx: AgentToolContext;
  state: FakeWorkflowState;
  updateWorkflow: jest.Mock;
  internalFetchMock: jest.Mock;
} {
  const state: FakeWorkflowState = { config: emptyConfig() };

  const getWorkflow = jest.fn(async () => ({
    id: "wf-1",
    name: "WF",
    description: null,
    slug: "wf",
    version: 3,
    config: state.config,
  }));
  const updateWorkflow = jest.fn(
    async (_id: string, _actor: string, patch: { config: GraphWorkflowConfig }) => {
      state.config = patch.config;
      return { id: "wf-1", name: "WF" };
    },
  );

  const workflowService = {
    getWorkflow,
    updateWorkflow,
  } as unknown as WorkflowService;

  const dynamicNodesService = {
    getMergedCatalogForGroup: jest.fn(async () => []),
  } as unknown as DynamicNodesService;

  // internalFetch hits global fetch; stub it so HTTP self-call tools work.
  const internalFetchMock = jest.fn();
  global.fetch = internalFetchMock as unknown as typeof fetch;

  const ctx: AgentToolContext = {
    actorId: "actor-1",
    groupId: "group-1",
    workflowId: "wf-1",
    apiKey: "key-1",
    backendBaseUrl: "http://backend",
    workflowService,
    dynamicNodesService,
    ...overrides,
  };

  return { ctx, state, updateWorkflow, internalFetchMock };
}

function fetchResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// ── ITEM 22 — listSourceCatalog ─────────────────────────────────────

describe("listSourceCatalog (ITEM 22)", () => {
  it("is registered as a tool", () => {
    const { ctx } = makeCtx();
    const tools = createAgentTools(ctx);
    expect(tools.listSourceCatalog).toBeDefined();
  });

  it("returns every source-catalog entry", async () => {
    const { ctx } = makeCtx();
    const tools = createAgentTools(ctx);
    const result = await exec<{
      ok: boolean;
      count: number;
      sources: Array<{ sourceType: string }>;
    }>(tools, "listSourceCatalog", {});
    expect(result.ok).toBe(true);
    expect(result.count).toBe(SOURCE_CATALOG.length);
    const types = result.sources.map((s) => s.sourceType).sort();
    expect(types).toEqual(SOURCE_CATALOG.map((e) => e.type).sort());
    // source.upload is the seeded entry-point source — must be present.
    expect(types).toContain("source.upload");
  });
});

// ── ITEM 1 — agent writes go through the auto-wire resolver ──────────

describe("auto-wire resolution on the agent write path (ITEM 1)", () => {
  it("resolveConfigForPersist matches the canonical editor sequence", () => {
    const config = emptyConfig({
      nodes: {
        up: {
          id: "up",
          type: "source",
          sourceType: "source.upload",
          name: "Upload",
          parameters: {},
          position: { x: 0, y: 0 },
        } as unknown as GraphNode,
        prep: {
          id: "prep",
          type: "activity",
          activityType: "file.prepare",
          name: "Prepare",
          parameters: {},
          position: { x: 200, y: 0 },
        } as unknown as GraphNode,
      },
      edges: [{ source: "up", target: "prep" }],
      entryNodeId: "up",
    });

    const canonical = stripRedundantLocks(
      resolveBindings(normaliseLocks(config)),
    );
    expect(resolveConfigForPersist(config)).toEqual(canonical);
  });

  it("persists an editor-equivalent (resolver-applied) config, not raw config", async () => {
    const { ctx, state, updateWorkflow } = makeCtx();
    // A config the agent would build, with a canonical hand-authored
    // (non-__auto) input binding — the editor marks this user-locked.
    const rawConfig = emptyConfig({
      nodes: {
        up: {
          id: "up",
          type: "source",
          sourceType: "source.upload",
          name: "Upload",
          parameters: {},
          position: { x: 0, y: 0 },
        } as unknown as GraphNode,
        prep: {
          id: "prep",
          type: "activity",
          activityType: "file.prepare",
          name: "Prepare",
          parameters: {},
          position: { x: 200, y: 0 },
          inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        } as unknown as GraphNode,
      },
      edges: [{ source: "up", target: "prep" }],
      entryNodeId: "up",
    });
    state.config = rawConfig;

    const tools = createAgentTools(ctx);
    // Any write tool routes through the resolver-backed persist path.
    await exec(tools, "addNode", {
      node: {
        id: "extra",
        type: "file.prepare",
        name: "Extra",
      },
    });

    expect(updateWorkflow).toHaveBeenCalledTimes(1);
    const persisted = state.config;

    // (a) The persisted config equals what the editor's save pipeline
    //     (resolveBindings → normaliseLocks → stripRedundantLocks) would
    //     produce — i.e. the server-side resolution pass ran. It is a
    //     resolver fixed-point.
    expect(persisted).toEqual(resolveConfigForPersist(persisted));

    // (b) The implicit lock for the hand-authored non-__auto binding was
    //     normalised and then stripped at save time (re-derivable on
    //     load) — exactly the editor's behaviour. The binding itself is
    //     preserved. Previously the agent persisted RAW config and this
    //     normalisation never happened server-side (ITEM 1).
    const prep = persisted.nodes.prep as GraphNode & {
      metadata?: { lockedInputPorts?: string[] };
      inputs?: Array<{ port: string; ctxKey: string }>;
    };
    expect(prep.inputs).toEqual([{ port: "blobKey", ctxKey: "documentUrl" }]);
    expect(prep.metadata?.lockedInputPorts).toBeUndefined();
  });
});

// ── ITEM 27 / 26 — tool-result wrapping + truncation ────────────────

describe("wrapToolData (ITEM 27 delimiting + ITEM 26 truncation)", () => {
  it("wraps payloads in the DATA fence", () => {
    const out = wrapToolData({ hello: "world" }, 1000);
    expect(out).toContain("TOOL_RESULT_DATA");
    expect(out).toContain('{"hello":"world"}');
    expect(out.startsWith("<<<TOOL_RESULT_DATA")).toBe(true);
  });

  it("truncates oversized payloads with an explicit marker", () => {
    const big = "x".repeat(500);
    const out = wrapToolData(big, 50);
    expect(out).toContain("[truncated");
    expect(out).toContain("of");
    // Truncated body is bounded near the cap (plus fence + marker).
    expect(out.length).toBeLessThan(200);
  });

  it("getPreviewCache wraps the preview body returned to the model", async () => {
    const { ctx, internalFetchMock } = makeCtx();
    internalFetchMock.mockResolvedValueOnce(
      fetchResponse(200, { node1: { text: "secret OCR text" } }),
    );
    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean; preview: string }>(
      tools,
      "getPreviewCache",
      {},
    );
    expect(result.ok).toBe(true);
    expect(typeof result.preview).toBe("string");
    expect(result.preview).toContain("TOOL_RESULT_DATA");
    expect(result.preview).toContain("secret OCR text");
  });

  it("getPreviewCache truncates a huge preview body", async () => {
    const { ctx, internalFetchMock } = makeCtx({ maxToolResultChars: 100 });
    internalFetchMock.mockResolvedValueOnce(
      fetchResponse(200, { node1: { text: "y".repeat(5000) } }),
    );
    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean; preview: string }>(
      tools,
      "getPreviewCache",
      {},
    );
    expect(result.preview).toContain("[truncated");
  });

  it("getWorkflow wraps the workflow config body", async () => {
    const { ctx } = makeCtx();
    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean; workflow: string }>(
      tools,
      "getWorkflow",
      {},
    );
    expect(typeof result.workflow).toBe("string");
    expect(result.workflow).toContain("TOOL_RESULT_DATA");
  });
});

// ── ITEM 25 — tools.ts write / validation / retry logic ─────────────

describe("connectNodes validation (ITEM 25)", () => {
  it("returns not-found when the source node is missing", async () => {
    const { ctx, state } = makeCtx();
    state.config = emptyConfig({
      nodes: {
        b: {
          id: "b",
          type: "activity",
          activityType: "file.prepare",
          name: "B",
          parameters: {},
          position: { x: 0, y: 0 },
        } as unknown as GraphNode,
      },
    });
    const tools = createAgentTools(ctx);
    const result = await exec<{
      ok: boolean;
      error?: { code: string };
    }>(tools, "connectNodes", { sourceNodeId: "a", targetNodeId: "b" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("not-found");
  });

  it("returns not-found when the target node is missing", async () => {
    const { ctx, state } = makeCtx();
    state.config = emptyConfig({
      nodes: {
        a: {
          id: "a",
          type: "source",
          sourceType: "source.upload",
          name: "A",
          parameters: {},
          position: { x: 0, y: 0 },
        } as unknown as GraphNode,
      },
    });
    const tools = createAgentTools(ctx);
    const result = await exec<{
      ok: boolean;
      error?: { code: string };
    }>(tools, "connectNodes", { sourceNodeId: "a", targetNodeId: "z" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("not-found");
  });

  // ITEM 1 follow-up: an explicit binding must land in the canonical `inputs`
  // field (which the auto-wire resolver and the execution engine read), NOT a
  // dead `inputBindings` field that nothing consumes.
  it("writes an explicit binding to canonical `inputs`, not `inputBindings`", async () => {
    const { ctx, state, updateWorkflow } = makeCtx();
    state.config = emptyConfig({
      nodes: {
        up: {
          id: "up",
          type: "source",
          sourceType: "source.upload",
          name: "Upload",
          parameters: {},
          position: { x: 0, y: 0 },
        } as unknown as GraphNode,
        prep: {
          id: "prep",
          type: "activity",
          activityType: "file.prepare",
          name: "Prepare",
          parameters: {},
          position: { x: 200, y: 0 },
        } as unknown as GraphNode,
      },
      ctx: { documentUrl: { kind: "Document", isInput: true } },
      entryNodeId: "up",
    });
    const tools = createAgentTools(ctx);

    const result = await exec<{ ok: boolean }>(tools, "connectNodes", {
      sourceNodeId: "up",
      targetNodeId: "prep",
      binding: { port: "blobKey", ctxKey: "documentUrl" },
    });
    expect(result.ok).toBe(true);

    const prep = state.config.nodes.prep as GraphNode & {
      inputs?: Array<{ port: string; ctxKey: string }>;
      inputBindings?: unknown;
    };
    expect(prep.inputs).toContainEqual({
      port: "blobKey",
      ctxKey: "documentUrl",
    });
    // The legacy dead field must not be written.
    expect(prep.inputBindings).toBeUndefined();
    expect(updateWorkflow).toHaveBeenCalledTimes(1);
  });

  it("addNode writes node.inputs to the canonical `inputs` field", async () => {
    const { ctx, state } = makeCtx();
    state.config = emptyConfig({
      nodes: {
        up: {
          id: "up",
          type: "source",
          sourceType: "source.upload",
          name: "Upload",
          parameters: {},
          position: { x: 0, y: 0 },
        } as unknown as GraphNode,
      },
      ctx: { documentUrl: { kind: "Document", isInput: true } },
      entryNodeId: "up",
    });
    const tools = createAgentTools(ctx);

    await exec(tools, "addNode", {
      node: {
        id: "prep",
        type: "file.prepare",
        name: "Prepare",
        inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
      },
    });

    const prep = state.config.nodes.prep as GraphNode & {
      inputs?: Array<{ port: string; ctxKey: string }>;
      inputBindings?: unknown;
    };
    expect(prep.inputs).toContainEqual({
      port: "blobKey",
      ctxKey: "documentUrl",
    });
    expect(prep.inputBindings).toBeUndefined();
  });
});

describe("declareCtx (ITEM 25)", () => {
  it("writes a typed ctx key through the resolver-backed persist path", async () => {
    const { ctx, state, updateWorkflow } = makeCtx();
    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean }>(tools, "declareCtx", {
      key: "documentUrl",
      kind: "Document",
      isInput: true,
    });
    expect(result.ok).toBe(true);
    expect(updateWorkflow).toHaveBeenCalledTimes(1);
    expect(state.config.ctx.documentUrl).toEqual({
      kind: "Document",
      isInput: true,
    });
  });
});

describe("publishDynamicNode 409 → PUT republish (ITEM 25)", () => {
  it("retries as PUT to /:slug when POST returns 409", async () => {
    const { ctx, internalFetchMock } = makeCtx();
    // POST → 409 conflict, then PUT → 200 OK.
    internalFetchMock
      .mockResolvedValueOnce(fetchResponse(409, { error: "slug exists" }))
      .mockResolvedValueOnce(fetchResponse(200, { slug: "my-node" }));

    const script =
      "/**\n * @name my-node\n * @inputs []\n * @outputs []\n */\nexport default async () => ({});";

    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean; slug?: string }>(
      tools,
      "publishDynamicNode",
      { script },
    );

    expect(result.ok).toBe(true);
    expect(result.slug).toBe("my-node");
    expect(internalFetchMock).toHaveBeenCalledTimes(2);
    // Second call must be the PUT to the slug-scoped endpoint.
    const secondCallUrl = internalFetchMock.mock.calls[1][0] as string;
    const secondCallInit = internalFetchMock.mock.calls[1][1] as RequestInit;
    expect(secondCallUrl).toContain("/api/dynamic-nodes/my-node");
    expect(secondCallInit.method).toBe("PUT");
  });

  it("surfaces the error when 409 carries no parseable @name", async () => {
    const { ctx, internalFetchMock } = makeCtx();
    internalFetchMock.mockResolvedValueOnce(
      fetchResponse(409, { error: "slug exists" }),
    );
    const script =
      "// no jsdoc name header here at all but长 enough to pass min length";
    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean }>(tools, "publishDynamicNode", {
      script,
    });
    expect(result.ok).toBe(false);
    // Only the POST was attempted — no slug to PUT to.
    expect(internalFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createWorkflow binds the conversation (ITEM 25)", () => {
  it("invokes onWorkflowCreated with the new id", async () => {
    const onWorkflowCreated = jest.fn();
    const createWorkflow = jest.fn(async () => ({
      id: "wf-new",
      name: "New",
      slug: "new",
    }));
    const { ctx } = makeCtx({
      workflowId: null,
      onWorkflowCreated,
      workflowService: {
        createWorkflow,
      } as unknown as WorkflowService,
    });
    const tools = createAgentTools(ctx);
    const result = await exec<{ ok: boolean; workflow: { id: string } }>(
      tools,
      "createWorkflow",
      { name: "New" },
    );
    expect(result.ok).toBe(true);
    expect(result.workflow.id).toBe("wf-new");
    expect(onWorkflowCreated).toHaveBeenCalledWith("wf-new");
  });
});
