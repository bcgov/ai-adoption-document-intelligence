/**
 * Experiment 02 — Mistral Document AI on Azure AI Foundry
 *
 * Two-layer test suite for the
 * `docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json`
 * template:
 *
 *   1. **Static + structural** assertions on the JSON template (cheap, no
 *      Temporal connection): metadata, scope rules, sync-provider chain
 *      wiring, schema validation, and consistency with the recorded Foundry
 *      OCR fixture.
 *   2. **Runtime end-to-end** workflow execution against a real local
 *      Temporal cluster (`localhost:7233`, the dev docker stack). Loads the
 *      JSON template, runs the actual `graphWorkflow` workflow, and replays
 *      the captured Foundry OCR response through mocked activities. Both
 *      branches of the `reviewSwitch` are exercised: high-confidence skips
 *      humanReview; low-confidence routes through humanReview, gets a
 *      `humanApproval` signal, then completes via `storeResults`.
 *
 * Mistral on Foundry is a sync provider (single HTTP call, server-side
 * OCR-then-annotation chain), so there's no `pollUntil` to shrink — the
 * runtime tests run essentially as fast as the workflow engine can step.
 *
 * The OCR fixture lives at
 * `apps/temporal/src/__fixtures__/experiment-02/mistral-azure-ocr-response-1-81.json`
 * and matches the documented Mistral OCR response shape so the canonical
 * mapper can convert it to `OCRResult` directly.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { computeConfigHash } from "./config-hash";
import { computeTopologicalOrder } from "./graph-engine/graph-algorithms";
import { validateGraphConfigForExecution } from "./graph-schema-validator";
import { graphWorkflow } from "./graph-workflow";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
  GraphWorkflowInput,
  PollUntilNode,
  SwitchNode,
} from "./graph-workflow-types";
import type { MistralOcrApiResponse } from "./ocr-providers/mistral/mistral-ocr-types";
import { mistralOcrResponseToOcrResult } from "./ocr-providers/mistral/mistral-to-ocr-result";
import type { OCRResult } from "./types";

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "docs-md",
  "graph-workflows",
  "templates",
  "experiment-02-mistral-doc-ai-azure-workflow.json",
);
const FIXTURE_PATH = path.join(
  __dirname,
  "__fixtures__",
  "experiment-02",
  "mistral-azure-ocr-response-1-81.json",
);

const TEMPORAL_ADDRESS = process.env.TEMPORAL_TEST_ADDRESS ?? "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_TEST_NAMESPACE ?? "default";

// ---------------------------------------------------------------------------
// Fixture types + loaders
// ---------------------------------------------------------------------------

function loadTemplate(): GraphWorkflowConfig {
  return JSON.parse(
    fs.readFileSync(TEMPLATE_PATH, "utf-8"),
  ) as GraphWorkflowConfig;
}

function loadFixture(): MistralOcrApiResponse {
  return JSON.parse(
    fs.readFileSync(FIXTURE_PATH, "utf-8"),
  ) as MistralOcrApiResponse;
}

function activityTypes(graph: GraphWorkflowConfig): string[] {
  return Object.values(graph.nodes ?? {})
    .filter((n) => n.type === "activity" || n.type === "pollUntil")
    .map((n) => (n as ActivityNode | PollUntilNode).activityType)
    .filter((t): t is string => typeof t === "string");
}

function findEdge(
  graph: GraphWorkflowConfig,
  source: string,
  target: string,
): GraphEdge | undefined {
  return graph.edges?.find((e) => e.source === source && e.target === target);
}

// ---------------------------------------------------------------------------
// Mock activity construction (used by runtime tests)
// ---------------------------------------------------------------------------

interface ActivityCall {
  type: string;
  params: Record<string, unknown>;
}

type ActivityImpl = (
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** Build an `OCRResult` from the recorded Foundry response via the canonical mapper. */
function buildOcrResultFromFixture(fixture: MistralOcrApiResponse): OCRResult {
  return mistralOcrResponseToOcrResult(
    fixture,
    {
      fileName: "1 81.jpg",
      fileType: "image",
      requestId: "test-mistral-azure-id",
      modelId: fixture.model,
    },
    undefined,
  );
}

function buildMockActivities(opts: {
  ocrResult: OCRResult;
  averageConfidence: number;
  requiresReview: boolean;
  callsRef: ActivityCall[];
}): Record<string, ActivityImpl> {
  const { ocrResult, averageConfidence, requiresReview, callsRef } = opts;
  const record = (type: string, params: Record<string, unknown>) =>
    callsRef.push({ type, params });

  return {
    "file.prepare": async (params) => {
      record("file.prepare", params);
      return {
        preparedData: {
          blobKey: params.blobKey ?? "test-blob-key",
          fileName: params.fileName ?? "1 81.jpg",
          fileType: params.fileType ?? "image",
          contentType: params.contentType ?? "image/jpeg",
          modelId: params.modelId ?? "mistral-document-ai-2512",
        },
      };
    },
    "document.updateStatus": async (params) => {
      record("document.updateStatus", params);
      return { success: true };
    },
    "mistralAzureOcr.process": async (params) => {
      record("mistralAzureOcr.process", params);
      return { ocrResult };
    },
    "ocr.cleanup": async (params) => {
      record("ocr.cleanup", params);
      return { cleanedResult: ocrResult };
    },
    "ocr.checkConfidence": async (params) => {
      record("ocr.checkConfidence", params);
      return { averageConfidence, requiresReview };
    },
    "ocr.storeResults": async (params) => {
      record("ocr.storeResults", params);
      return { success: true };
    },
  };
}

function makeWorkflowInput(
  graph: GraphWorkflowConfig,
  initialCtx: Record<string, unknown>,
): GraphWorkflowInput {
  return {
    graph,
    initialCtx,
    configHash: computeConfigHash(graph),
    runnerVersion: "1.0.0",
  };
}

// ---------------------------------------------------------------------------
// Static + structural tests
// ---------------------------------------------------------------------------

describe("Experiment 02 — Mistral Doc AI on Foundry workflow template (static)", () => {
  describe("template metadata", () => {
    it("declares the experiment-specific name and tags", () => {
      const graph = loadTemplate();
      expect(graph.metadata?.name).toBe(
        "Experiment 02 - Mistral Document AI on Azure Foundry",
      );
      expect(graph.metadata?.tags).toEqual(
        expect.arrayContaining([
          "experiment",
          "experiment-02",
          "mistral",
          "azure-foundry",
        ]),
      );
    });

    it("targets the seeded local dataset", () => {
      const graph = loadTemplate() as GraphWorkflowConfig & {
        metadata?: { targetLocalDataset?: string };
      };
      expect(graph.metadata?.targetLocalDataset).toBe("samples-mix-private");
    });

    it("uses the Foundry deployment id as the modelId default", () => {
      const graph = loadTemplate();
      expect(graph.ctx?.modelId?.defaultValue).toBe("mistral-document-ai-2512");
    });

    it("entry node is prepareFileData", () => {
      const graph = loadTemplate();
      expect(graph.entryNodeId).toBe("prepareFileData");
    });
  });

  describe("scope rules from the brief", () => {
    it("uses the new Foundry activity (mistralAzureOcr.process) — not the public-API path", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).toContain("mistralAzureOcr.process");
      expect(types).not.toContain("mistralOcr.process");
    });

    it("does not use the Azure DI submit/poll/extract chain (this is a sync provider)", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).not.toContain("azureOcr.submit");
      expect(types).not.toContain("azureOcr.poll");
      expect(types).not.toContain("azureOcr.extract");
    });

    it("does not include LLM enrichment (out of scope for E02)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.enrich");
    });

    it("does not include cross-field validation (out of scope for E02)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.documentValidateFields");
    });

    it("the workflow has no pollUntil node (sync provider)", () => {
      const graph = loadTemplate();
      const polls = Object.values(graph.nodes ?? {}).filter(
        (n) => n.type === "pollUntil",
      );
      expect(polls).toHaveLength(0);
    });
  });

  describe("chain wiring", () => {
    it("topological order matches the brief's sync-provider sequence", () => {
      const graph = loadTemplate();
      const order = computeTopologicalOrder(graph);

      const idx = (id: string) => order.indexOf(id);
      const pairs: Array<[string, string]> = [
        ["prepareFileData", "mistralAzureOcr"],
        ["mistralAzureOcr", "postOcrCleanup"],
        ["postOcrCleanup", "checkConfidence"],
        ["checkConfidence", "reviewSwitch"],
      ];
      for (const [before, after] of pairs) {
        expect(idx(before)).toBeGreaterThanOrEqual(0);
        expect(idx(after)).toBeGreaterThan(idx(before));
      }
    });

    it("review switch routes low-confidence to humanReview, default to storeResults", () => {
      const graph = loadTemplate();
      const sw = graph.nodes?.reviewSwitch as SwitchNode | undefined;
      expect(sw?.type).toBe("switch");
      expect(sw?.cases?.[0]?.edgeId).toBe("edge-switch-to-humanGate");
      expect(sw?.defaultEdge).toBe("edge-switch-to-store");

      expect(findEdge(graph, "reviewSwitch", "humanReview")).toBeDefined();
      expect(findEdge(graph, "reviewSwitch", "storeResults")).toBeDefined();
      expect(findEdge(graph, "humanReview", "storeResults")).toBeDefined();
    });

    it("Foundry activity carries the configured timeout/retry shape", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.mistralAzureOcr as ActivityNode | undefined;
      expect(node?.activityType).toBe("mistralAzureOcr.process");
      expect(node?.timeout?.startToClose).toBe("20m");
      // Generous retry policy is required to clear the Foundry deployment's
      // per-minute request quota (default 10 RPM) under a 33-sample benchmark
      // fan-out — see SUMMARY.md.
      expect(node?.retry?.maximumAttempts).toBeGreaterThanOrEqual(20);
      expect(node?.retry?.initialInterval).toBeDefined();
      expect(node?.retry?.maximumInterval).toBeDefined();
    });

    it("ocr.checkConfidence reads its threshold from ctx.confidenceThreshold (default 0.95)", () => {
      const graph = loadTemplate();
      expect(graph.ctx?.confidenceThreshold?.defaultValue).toBe(0.95);
      const node = graph.nodes?.checkConfidence as ActivityNode | undefined;
      const thresholdInput = node?.inputs?.find((i) => i.port === "threshold");
      expect(thresholdInput?.ctxKey).toBe("confidenceThreshold");
    });

    it("Foundry activity wires templateModelId from ctx for document_annotation", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.mistralAzureOcr as ActivityNode | undefined;
      const templateInput = node?.inputs?.find(
        (i) => i.port === "templateModelId",
      );
      expect(templateInput?.ctxKey).toBe("templateModelId");
    });

    it("Foundry activity emits both ocrResult and ocrResponse so persistOcrCache populates benchmark_ocr_cache", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.mistralAzureOcr as ActivityNode | undefined;
      const outputPorts = (node?.outputs ?? []).map((o) => o.port);
      expect(outputPorts).toContain("ocrResult");
      expect(outputPorts).toContain("ocrResponse");
      // ctx must declare both keys.
      expect(graph.ctx?.ocrResult).toBeDefined();
      expect(graph.ctx?.ocrResponse).toBeDefined();
    });
  });

  describe("graph schema validation", () => {
    it("template passes validateGraphConfigForExecution", () => {
      const graph = loadTemplate();
      const result = validateGraphConfigForExecution(graph);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  });

  describe("recorded Foundry OCR response", () => {
    it("fixture model matches the template's Foundry deployment default", () => {
      const fixture = loadFixture();
      const graph = loadTemplate();
      expect(fixture.model).toBe(graph.ctx?.modelId?.defaultValue);
    });

    it("fixture exposes the Foundry response shape (markdown, dimensions, usage)", () => {
      // Real Foundry responses captured in `__fixtures__/experiment-02/`
      // diverge from the public Mistral API: confidence_scores is absent
      // (the field is rejected with HTTP 422 if requested), and Foundry adds
      // page-level `header`/`footer`/`hyperlinks`/`tables`. The mapper handles
      // both shapes; downstream gating reads the synthesized
      // `average_page_confidence_score` fallback (0.95) when missing.
      const fixture = loadFixture();
      expect(fixture.pages.length).toBeGreaterThan(0);
      const page = fixture.pages[0];
      expect(page.markdown.length).toBeGreaterThan(0);
      expect(page.dimensions?.width).toBeGreaterThan(0);
      expect(page.dimensions?.height).toBeGreaterThan(0);
      expect(fixture.usage_info?.pages_processed).toBeGreaterThanOrEqual(1);
    });

    it("mapper produces a valid OCRResult from the real Foundry fixture (graceful degradation when bbox/confidence missing)", () => {
      // Foundry's response omits per-word bbox + confidence on this
      // deployment, so synthesized words from markdown have empty polygons
      // (per the mapper's documented fallback). The bbox-fix in the mapper
      // is exercised via the unit-level mapper tests with synthetic bbox
      // input; here we verify the mapper produces a usable OCRResult against
      // the shape Foundry actually returns.
      const fixture = loadFixture();
      const ocr = mistralOcrResponseToOcrResult(
        fixture,
        {
          fileName: "1 81.jpg",
          fileType: "image",
          requestId: "test",
          modelId: fixture.model,
        },
        undefined,
      );
      expect(ocr.success).toBe(true);
      expect(ocr.modelId).toBe(fixture.model);
      expect(ocr.extractedText.length).toBeGreaterThan(0);
      expect(ocr.pages.length).toBe(1);
      expect(ocr.pages[0].words.length).toBeGreaterThanOrEqual(1);
    });

    it("document_annotation is null on the real Foundry deployment (annotation step is not running on this Foundry route — flagged in SUMMARY.md)", () => {
      // The deployed Foundry route reports `usage_info.pages_processed_annotation = 0`
      // even when `document_annotation_format` is sent in the request body —
      // i.e., Foundry accepts the field but skips the annotation step on
      // this deployment. The mapper handles this by returning empty
      // `keyValuePairs`/`documents`. SUMMARY.md tracks this as a follow-up.
      const fixture = loadFixture();
      const usage = fixture.usage_info as {
        pages_processed_annotation?: number;
      };
      expect(fixture.document_annotation).toBeNull();
      expect(usage.pages_processed_annotation).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Runtime tests against local Temporal cluster
// ---------------------------------------------------------------------------

// CI runs `npm test` without a Temporal sidecar (see .github/workflows/temporal-qa.yml),
// so the runtime layer would fail trying to connect to localhost:7233. Skip
// the suite when CI=true (set by GitHub Actions automatically). The static
// suite above still runs on every CI build.
const describeRuntime = process.env.CI ? describe.skip : describe;

describeRuntime(
  "Experiment 02 — runtime against local Temporal cluster",
  () => {
    let nativeConnection: NativeConnection | null = null;
    let connection: Connection | null = null;
    let client: Client | null = null;

    beforeAll(async () => {
      nativeConnection = await NativeConnection.connect({
        address: TEMPORAL_ADDRESS,
      });
      connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
      client = new Client({ connection, namespace: TEMPORAL_NAMESPACE });
    }, 30000);

    afterAll(async () => {
      await nativeConnection?.close();
      await connection?.close();
    });

    it("high-confidence sample skips human review and runs the chain in order", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const taskQueue = `e02-test-high-${process.pid}-${Date.now()}`;
      const fixture = loadFixture();
      const ocrResult = buildOcrResultFromFixture(fixture);
      const calls: ActivityCall[] = [];
      const activities = buildMockActivities({
        ocrResult,
        averageConfidence: 0.99,
        requiresReview: false,
        callsRef: calls,
      });

      const worker = await Worker.create({
        connection: nativeConnection,
        namespace: TEMPORAL_NAMESPACE,
        taskQueue,
        workflowsPath: require.resolve("./graph-workflow"),
        activities,
      });

      const graph = loadTemplate();
      const input = makeWorkflowInput(graph, {
        documentId: "test-doc-high-confidence",
        blobKey: "blobs/1-81.jpg",
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      });

      const result = await worker.runUntil(
        client.workflow.execute(graphWorkflow, {
          workflowId: `e02-test-high-${Date.now()}`,
          taskQueue,
          args: [input],
        }),
      );

      expect(result.status).toBe("completed");
      expect(result.ctx.requiresReview).toBe(false);
      expect(result.ctx.averageConfidence).toBe(0.99);

      const ctxOrder = calls.map((c) => c.type);
      expect(ctxOrder).toContain("file.prepare");
      expect(ctxOrder).toContain("mistralAzureOcr.process");
      expect(ctxOrder).toContain("ocr.cleanup");
      expect(ctxOrder).toContain("ocr.checkConfidence");
      expect(ctxOrder).toContain("ocr.storeResults");

      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("file.prepare")).toBeLessThan(idx("mistralAzureOcr.process"));
      expect(idx("mistralAzureOcr.process")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.checkConfidence"));
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));

      // Real Foundry OCR data flowed through cleanup as a usable OCRResult.
      // The Foundry deployment we hit returns markdown without per-word
      // bbox/confidence (see SUMMARY.md), so words are synthesized from the
      // markdown with empty polygons. The mapper's bbox-fix is exercised in
      // the unit tests with synthetic bbox input.
      const cleanupCall = calls.find((c) => c.type === "ocr.cleanup");
      const cleanupOcr = cleanupCall?.params.ocrResult as OCRResult | undefined;
      expect(cleanupOcr?.modelId).toBe("mistral-document-ai-2512");
      const cleanupWords = cleanupOcr?.pages?.[0]?.words ?? [];
      expect(cleanupWords.length).toBeGreaterThan(0);

      // The Foundry activity received the templateModelId for document_annotation.
      const ocrCall = calls.find((c) => c.type === "mistralAzureOcr.process");
      expect(ocrCall?.params.templateModelId).toBeDefined();
    }, 60000);

    it("low-confidence sample routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const taskQueue = `e02-test-low-${process.pid}-${Date.now()}`;
      const fixture = loadFixture();
      const ocrResult = buildOcrResultFromFixture(fixture);
      const calls: ActivityCall[] = [];
      const activities = buildMockActivities({
        ocrResult,
        averageConfidence: 0.42,
        requiresReview: true,
        callsRef: calls,
      });

      const worker = await Worker.create({
        connection: nativeConnection,
        namespace: TEMPORAL_NAMESPACE,
        taskQueue,
        workflowsPath: require.resolve("./graph-workflow"),
        activities,
      });

      const graph = loadTemplate();
      const input = makeWorkflowInput(graph, {
        documentId: "test-doc-low-confidence",
        blobKey: "blobs/1-81.jpg",
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      });

      const handle = await client.workflow.start(graphWorkflow, {
        workflowId: `e02-test-low-${Date.now()}`,
        taskQueue,
        args: [input],
      });

      const resultPromise = handle.result();
      const runPromise = worker.runUntil(resultPromise);

      await handle.signal("humanApproval", {
        approved: true,
        reviewer: "test-reviewer",
        comments: "ok",
        rejectionReason: "",
        annotations: "",
      });

      const result = await runPromise;
      expect(result.status).toBe("completed");
      expect(result.ctx.requiresReview).toBe(true);
      expect(result.ctx.averageConfidence).toBe(0.42);

      expect(calls.map((c) => c.type)).toContain("ocr.storeResults");

      const ctxOrder = calls.map((c) => c.type);
      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("mistralAzureOcr.process")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.checkConfidence"));
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));
    }, 60000);
  },
);
