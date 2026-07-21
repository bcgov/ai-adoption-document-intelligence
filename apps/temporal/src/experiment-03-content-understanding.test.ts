/**
 * Experiment 03 — Azure Content Understanding
 *
 * Two-layer test suite for the
 * `docs-md/graph-workflows/templates/experiment-03-content-understanding-workflow.json`
 * template:
 *
 *   1. **Static + structural** assertions on the JSON template (cheap, no
 *      Temporal connection): metadata, scope rules, sync-shape chain
 *      wiring (CU is async server-side but the activity polls internally,
 *      so the workflow has no `pollUntil` node), schema validation, and
 *      consistency with the recorded CU fixture.
 *   2. **Runtime end-to-end** workflow execution against a real local
 *      Temporal cluster (`localhost:7233`, the dev docker stack). Loads
 *      the JSON template, runs the actual `graphWorkflow` workflow, and
 *      replays the captured CU response through mocked activities. Both
 *      branches of the `reviewSwitch` are exercised.
 *
 * The CU fixture lives at
 * `apps/temporal/src/__fixtures__/experiment-03/cu-response-1-81.json`
 * and matches the documented CU analyze-result shape so
 * `cu-to-ocr-result.ts` can convert it directly.
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
import { cuAnalyzeResultToOcrResult } from "./ocr-providers/azure-content-understanding/cu-to-ocr-result";
import type {
  CuAnalyzeOperation,
  CuAnalyzeResult,
} from "./ocr-providers/azure-content-understanding/cu-types";

/**
 * Build a CU analyze result whose single field carries `confidence`, fed to the
 * real analyze path via the harness's MOCK_AZURE_CU seam so the real gate is
 * deterministic. The mapper derives page confidence from the mean per-field
 * confidence, so one field is enough to drive high vs low.
 */
function cuResultWithConfidence(confidence: number): CuAnalyzeResult {
  return {
    analyzerId: "itest-cu-analyzer",
    apiVersion: "2025-11-01",
    contents: [
      {
        path: "input1",
        markdown: "Net Employment Income 1234",
        pages: [{ pageNumber: 1, width: 612, height: 792, unit: "pixel" }],
        fields: {
          applicant_oas_gis: {
            type: "number",
            valueNumber: 100,
            confidence,
          },
        },
      },
    ],
  };
}

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "docs-md",
  "graph-workflows",
  "templates",
  "experiment-03-content-understanding-workflow.json",
);
const FIXTURE_PATH = path.join(
  __dirname,
  "__fixtures__",
  "experiment-03",
  "cu-response-1-81.json",
);

// ---------------------------------------------------------------------------
// Fixture types + loaders
// ---------------------------------------------------------------------------

function loadTemplate(): GraphWorkflowConfig {
  return JSON.parse(
    fs.readFileSync(TEMPLATE_PATH, "utf-8"),
  ) as GraphWorkflowConfig;
}

function fixtureExists(): boolean {
  return fs.existsSync(FIXTURE_PATH);
}

function loadFixture(): CuAnalyzeOperation {
  return JSON.parse(
    fs.readFileSync(FIXTURE_PATH, "utf-8"),
  ) as CuAnalyzeOperation;
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

// (Runtime tests use the shared mock-only-paid harness; no per-activity mocks.)

// ---------------------------------------------------------------------------
// Static + structural tests
// ---------------------------------------------------------------------------

describe("Experiment 03 — Azure Content Understanding workflow template (static)", () => {
  describe("template metadata", () => {
    it("declares the experiment-specific name and tags", () => {
      const graph = loadTemplate();
      expect(graph.metadata?.name).toBe(
        "Experiment 03 - Azure Content Understanding",
      );
      expect(graph.metadata?.tags).toEqual(
        expect.arrayContaining([
          "experiment",
          "experiment-03",
          "content-understanding",
          "azure",
        ]),
      );
    });

    it("targets the seeded local dataset", () => {
      const graph = loadTemplate() as GraphWorkflowConfig & {
        metadata?: { targetLocalDataset?: string };
      };
      expect(graph.metadata?.targetLocalDataset).toBe("samples-mix-public");
    });

    it("entry node is prepareFileData", () => {
      const graph = loadTemplate();
      expect(graph.entryNodeId).toBe("prepareFileData");
    });

    it("templateModelId default points at the seeded SDPR template", () => {
      const graph = loadTemplate();
      expect(graph.ctx?.templateModelId?.defaultValue).toBe(
        "seed-sdpr-monthly-report-template",
      );
    });
  });

  describe("scope rules from the brief", () => {
    it("uses the new CU activity (azureContentUnderstanding.analyze) — not the Mistral or Azure DI paths", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).toContain("azureContentUnderstanding.analyze");
      expect(types).not.toContain("mistralAzureOcr.process");
      expect(types).not.toContain("mistralOcr.process");
      expect(types).not.toContain("azureOcr.submit");
    });

    it("does not include LLM enrichment (out of scope for E03)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.enrich");
    });

    it("does not include cross-field validation (out of scope for E03)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.documentValidateFields");
    });

    it("does not chain a pollUntil node — the CU activity polls internally", () => {
      const graph = loadTemplate();
      const polls = Object.values(graph.nodes ?? {}).filter(
        (n) => n.type === "pollUntil",
      );
      expect(polls).toHaveLength(0);
    });
  });

  describe("chain wiring", () => {
    it("topological order matches the brief's sequence", () => {
      const graph = loadTemplate();
      const order = computeTopologicalOrder(graph);
      const idx = (id: string) => order.indexOf(id);
      const pairs: Array<[string, string]> = [
        ["prepareFileData", "azureCuAnalyze"],
        ["azureCuAnalyze", "postOcrCleanup"],
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

    it("CU activity carries the configured timeout/retry shape (Foundry quota retry)", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.azureCuAnalyze as ActivityNode | undefined;
      expect(node?.activityType).toBe("azureContentUnderstanding.analyze");
      expect(node?.timeout?.startToClose).toBe("20m");
      // 30 attempts × 15 s × 1.5x × 60 s cap — mirrors mistralAzureOcr.process
      // because CU shares the Foundry RPM quota model.
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

    it("CU activity wires templateModelId from ctx for the analyzer build", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.azureCuAnalyze as ActivityNode | undefined;
      const templateInput = node?.inputs?.find(
        (i) => i.port === "templateModelId",
      );
      expect(templateInput?.ctxKey).toBe("templateModelId");
    });

    it("CU activity emits both ocrResult and ocrResponse so persistOcrCache populates benchmark_ocr_cache", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.azureCuAnalyze as ActivityNode | undefined;
      const outputPorts = (node?.outputs ?? []).map((o) => o.port);
      expect(outputPorts).toContain("ocrResult");
      expect(outputPorts).toContain("ocrResponse");
      expect(graph.ctx?.ocrResult).toBeDefined();
      expect(graph.ctx?.ocrResponse).toBeDefined();
    });

    it("CU activity carries the iteration kit's prompt + per-field descriptions + numericFieldsNullable on its parameters", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.azureCuAnalyze as ActivityNode | undefined;
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

  describe("recorded CU response (fixture)", () => {
    const describeFixture = fixtureExists() ? describe : describe.skip;

    describeFixture("when the captured CU fixture is present", () => {
      it("fixture parses as a CuAnalyzeOperation and has a Succeeded status", () => {
        const fixture = loadFixture();
        expect(["Succeeded", "succeeded"]).toContain(fixture.status);
        expect(fixture.result).toBeDefined();
      });

      it("fixture's primary content has markdown + at least one structured field", () => {
        const fixture = loadFixture();
        const primary = fixture.result?.contents?.[0];
        expect(primary).toBeDefined();
        expect((primary?.markdown ?? "").length).toBeGreaterThan(0);
        expect(Object.keys(primary?.fields ?? {}).length).toBeGreaterThan(0);
      });

      it("mapper produces a valid OCRResult from the captured CU fixture", () => {
        const fixture = loadFixture();
        const ocr = cuAnalyzeResultToOcrResult(
          fixture.result ?? {},
          {
            fileName: "1 81.jpg",
            fileType: "image",
            requestId: "test",
            modelId: fixture.result?.analyzerId ?? "x",
          },
          undefined,
        );
        expect(ocr.success).toBe(true);
        expect(ocr.extractedText.length).toBeGreaterThan(0);
        expect(ocr.pages.length).toBeGreaterThanOrEqual(1);
        expect(ocr.pages[0].words.length).toBeGreaterThanOrEqual(1);
      });

      it("structured-field pass actually ran (over half of fields are non-empty)", () => {
        const fixture = loadFixture();
        const fields = fixture.result?.contents?.[0]?.fields ?? {};
        const populated = Object.entries(fields).filter(([, v]) => {
          const value =
            v.valueString ??
            v.valueNumber ??
            v.valueDate ??
            (v as unknown as { value?: unknown }).value;
          return value !== undefined && value !== null && value !== "";
        });
        expect(populated.length).toBeGreaterThan(
          Math.floor(Object.keys(fields).length / 2),
        );
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Runtime tests against local Temporal cluster
// ---------------------------------------------------------------------------

const describeRuntime = process.env.CI ? describe.skip : describe;

describeRuntime(
  "Experiment 03 — runtime against local Temporal cluster (mock only paid services)",
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

    it("high-confidence CU result skips human review and persists the result", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplate();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({ cu: cuResultWithConfidence(0.99) });
      const taskQueue = `e03-itest-high-${process.pid}-${Date.now()}`;
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
        const workflowId = `e03-itest-high-${Date.now()}`;
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

    it("low-confidence CU result routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplate();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({ cu: cuResultWithConfidence(0.4) });
      const taskQueue = `e03-itest-low-${process.pid}-${Date.now()}`;
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
          workflowId: `e03-itest-low-${Date.now()}`,
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
