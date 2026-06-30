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
import {
  buildRealActivities,
  installPaidApiMocks,
  makeWorkflowInput,
  SAMPLE_IMAGE_ABS_PATH,
  seedTestDocument,
  TEMPORAL_ADDRESS,
  TEMPORAL_NAMESPACE,
} from "./__testlib__/integration-harness";
import {
  disconnectPrismaClient,
  getPrismaClient,
} from "./activities/database-client";
import { computeTopologicalOrder } from "./graph-engine/graph-algorithms";
import { validateGraphConfigForExecution } from "./graph-schema-validator";
import { getStatus, graphWorkflow } from "./graph-workflow";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
  PollUntilNode,
  SwitchNode,
} from "./graph-workflow-types";
import type { MistralOcrApiResponse } from "./ocr-providers/mistral/mistral-ocr-types";
import { mistralOcrResponseToOcrResult } from "./ocr-providers/mistral/mistral-to-ocr-result";

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

/**
 * Build a Mistral OCR response whose page carries `wordCount` synthesised words
 * each at `wordConfidence`, so the real gate is deterministic.
 *
 * Note: the mapper emits one key-value pair per template field (74 for the SDPR
 * schema) at a hard-coded confidence of 1.0, which forms a high floor in the
 * gate's average. To push the page mean below the 0.95 threshold the low case
 * therefore supplies many low-confidence page words; the high case needs only a
 * handful of high-confidence words to stay above the line.
 */
function mistralResponseWithConfidence(
  wordConfidence: number,
  wordCount: number,
): MistralOcrApiResponse {
  const word_confidence_scores = Array.from({ length: wordCount }, (_, i) => ({
    text: `w${i}`,
    confidence: wordConfidence,
    start_index: i * 4,
  }));
  return {
    model: "mistral-document-ai-2512",
    pages: [
      {
        index: 0,
        markdown: word_confidence_scores.map((w) => w.text).join(" "),
        dimensions: { width: 612, height: 792, dpi: 72 },
        confidence_scores: {
          average_page_confidence_score: wordConfidence,
          minimum_page_confidence_score: wordConfidence,
          word_confidence_scores,
        },
      },
    ],
    usage_info: { pages_processed: 1 },
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
      expect(graph.metadata?.targetLocalDataset).toBe("samples-mix-public");
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
    it("uses the merged Mistral activity with the azure (Foundry) variant — not the native public-API transport", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).toContain("mistralOcr.process");
      expect(types).not.toContain("mistralAzureOcr.process");
      const node = graph.nodes?.mistralAzureOcr as ActivityNode | undefined;
      const params = (node?.parameters ?? {}) as { variant?: string };
      expect(params.variant).toBe("azure");
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
      expect(node?.activityType).toBe("mistralOcr.process");
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

    it("Foundry activity carries the iteration kit's prompt + per-field descriptions + numericFieldsNullable on its parameters", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.mistralAzureOcr as ActivityNode | undefined;
      const params = (node?.parameters ?? {}) as {
        documentAnnotationPrompt?: string;
        fieldDescriptions?: Record<string, string>;
        numericFieldsNullable?: boolean;
      };
      expect(params.documentAnnotationPrompt?.length ?? 0).toBeGreaterThan(100);
      expect(params.documentAnnotationPrompt).toMatch(/SDPR|Applicant|Spouse/);
      // Per-field descriptions cover the full SDPR schema (74 fields).
      expect(
        Object.keys(params.fieldDescriptions ?? {}).length,
      ).toBeGreaterThanOrEqual(70);
      expect(params.numericFieldsNullable).toBe(true);
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
      // Foundry overloads the usage counters: when annotation runs, the
      // OCR-only `pages_processed` may be 0 and `pages_processed_annotation`
      // carries the real page count. Assert at least one is non-zero.
      const usage = fixture.usage_info as {
        pages_processed?: number;
        pages_processed_annotation?: number;
      };
      expect(
        (usage.pages_processed ?? 0) + (usage.pages_processed_annotation ?? 0),
      ).toBeGreaterThanOrEqual(1);
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

    it("document_annotation is populated on the real Foundry deployment (requires `strict: true` in the JSON schema; see SUMMARY.md)", () => {
      // Foundry runs the annotation step only when the `json_schema` wrapper
      // includes `strict: true`. Without it, Foundry silently accepts the
      // request, returns OCR markdown, and skips annotation
      // (`pages_processed_annotation: 0`, `document_annotation: null`). The
      // converter at `field-definitions-to-mistral-annotation-format.ts`
      // emits `strict: true`, and the recorded fixture exercises the
      // working path end-to-end.
      const fixture = loadFixture();
      const usage = fixture.usage_info as {
        pages_processed_annotation?: number;
      };
      expect(typeof fixture.document_annotation).toBe("string");
      expect(usage.pages_processed_annotation).toBe(1);
      const annotation = JSON.parse(fixture.document_annotation ?? "{}");
      const populated = Object.entries(annotation).filter(
        ([, v]) => v !== null && v !== "" && v !== undefined,
      );
      // Foundry returns the full SDPR field schema with most non-empty
      // (~67/74 on this sample); assert at least half are non-empty as a
      // sanity floor that won't false-fail on minor model output drift.
      expect(populated.length).toBeGreaterThan(
        Math.floor(Object.keys(annotation).length / 2),
      );
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
  "Experiment 02 — runtime against local Temporal cluster (mock only paid services)",
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
      await disconnectPrismaClient();
    });

    function runtimeCtx(documentId: string): Record<string, unknown> {
      return {
        documentId,
        blobKey: SAMPLE_IMAGE_ABS_PATH,
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      };
    }

    it("high-confidence Foundry response skips human review and persists the result + raw response (T6)", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplate();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({
        mistral: mistralResponseWithConfidence(0.99, 10),
      });
      const taskQueue = `e02-itest-high-${process.pid}-${Date.now()}`;
      const activeClient = client;
      try {
        const worker = await Worker.create({
          connection: nativeConnection,
          namespace: TEMPORAL_NAMESPACE,
          taskQueue,
          workflowsPath: require.resolve("./graph-workflow"),
          activities: buildRealActivities(graph, "itest-workflow-version-id"),
        });

        const input = makeWorkflowInput(graph, runtimeCtx(documentId));
        const workflowId = `e02-itest-high-${Date.now()}`;
        const { result, ctx } = await worker.runUntil(async () => {
          const result = await activeClient.workflow.execute(graphWorkflow, {
            workflowId,
            taskQueue,
            args: [input],
          });
          const status = await activeClient.workflow
            .getHandle(workflowId)
            .query(getStatus);
          return { result, ctx: status.ctx };
        });

        expect(result.status).toBe("completed");
        expect(ctx.requiresReview).toBe(false);
        expect(ctx.averageConfidence as number).toBeGreaterThanOrEqual(0.95);

        // T6: the raw Foundry response flows to ctx.ocrResponse so the
        // benchmark sample workflow's persistOcrCache step can write it.
        const ocrResponse = ctx.ocrResponse as { model?: string } | undefined;
        expect(ocrResponse).toBeDefined();
        expect(ocrResponse?.model).toBe("mistral-document-ai-2512");

        const prisma = getPrismaClient();
        const persisted = await prisma.ocrResult.findUnique({
          where: { document_id: documentId },
        });
        expect(persisted).not.toBeNull();
      } finally {
        mocks.restore();
        await cleanup();
      }
    }, 60000);

    it("low-confidence Foundry response routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplate();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({
        mistral: mistralResponseWithConfidence(0.05, 200),
      });
      const taskQueue = `e02-itest-low-${process.pid}-${Date.now()}`;
      const activeClient = client;
      try {
        const worker = await Worker.create({
          connection: nativeConnection,
          namespace: TEMPORAL_NAMESPACE,
          taskQueue,
          workflowsPath: require.resolve("./graph-workflow"),
          activities: buildRealActivities(graph, "itest-workflow-version-id"),
        });

        const input = makeWorkflowInput(graph, runtimeCtx(documentId));
        const handle = await activeClient.workflow.start(graphWorkflow, {
          workflowId: `e02-itest-low-${Date.now()}`,
          taskQueue,
          args: [input],
        });

        const { result, ctx } = await worker.runUntil(async () => {
          await handle.signal("humanApproval", {
            approved: true,
            reviewer: "test-reviewer",
            comments: "ok",
            rejectionReason: "",
            annotations: "",
          });
          const result = await handle.result();
          const status = await handle.query(getStatus);
          return { result, ctx: status.ctx };
        });
        expect(result.status).toBe("completed");
        expect(ctx.requiresReview).toBe(true);
        expect(ctx.averageConfidence as number).toBeLessThan(0.95);

        const prisma = getPrismaClient();
        const persisted = await prisma.ocrResult.findUnique({
          where: { document_id: documentId },
        });
        expect(persisted).not.toBeNull();
      } finally {
        mocks.restore();
        await cleanup();
      }
    }, 60000);
  },
);
