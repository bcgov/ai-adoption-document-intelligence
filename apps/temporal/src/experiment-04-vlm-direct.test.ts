/**
 * Experiment 04 — VLM-direct (gpt-5.4)
 *
 * Two-layer test suite for the
 * `docs-md/graph-workflows/templates/experiment-04-vlm-direct-workflow.json`
 * template:
 *
 *   1. **Static + structural** assertions on the JSON template (cheap, no
 *      Temporal connection): metadata, scope rules, chain wiring (sync
 *      shape — no pollUntil because the chat-completions call is sync),
 *      schema validation, and consistency with the recorded VLM fixture
 *      (when present).
 *   2. **Runtime end-to-end** workflow execution against a real local
 *      Temporal cluster (`localhost:7233`). Loads the JSON template,
 *      runs the actual `graphWorkflow` workflow, and replays the captured
 *      VLM response through mocked activities. Both branches of the
 *      `reviewSwitch` are exercised. CI-gated + fixture-gated.
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
import { vlmExtractionToOcrResult } from "./ocr-providers/vlm-direct/vlm-to-ocr-result";
import type { VlmDirectRawResponse } from "./ocr-providers/vlm-direct/vlm-types";

const SEED_TEMPLATE_ID = "seed-sdpr-monthly-report-template";

/**
 * Load the REAL seeded template field types (T4) so the mapper test exercises
 * the same `{field_key, field_type}` the activity loads — instead of guessing
 * types from key-name prefixes (which silently treats a non-`applicant_`/
 * `spouse_` number field as a string and drops its `valueNumber`).
 */
async function loadSeededFieldDefs(): Promise<
  Array<{ field_key: string; field_type: string }>
> {
  const prisma = getPrismaClient();
  const tm = await prisma.templateModel.findUnique({
    where: { id: SEED_TEMPLATE_ID },
    include: { field_schema: { orderBy: { display_order: "asc" } } },
  });
  return (tm?.field_schema ?? []).map((f) => ({
    field_key: f.field_key,
    field_type: f.field_type,
  }));
}

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "docs-md",
  "graph-workflows",
  "templates",
  "experiment-04-vlm-direct-workflow.json",
);
const FIXTURE_PATH = path.join(
  __dirname,
  "__fixtures__",
  "experiment-04",
  "vlm-response-1-81.json",
);

function loadTemplate(): GraphWorkflowConfig {
  return JSON.parse(
    fs.readFileSync(TEMPLATE_PATH, "utf-8"),
  ) as GraphWorkflowConfig;
}

function fixtureExists(): boolean {
  return fs.existsSync(FIXTURE_PATH);
}

function loadFixture(): VlmDirectRawResponse {
  return JSON.parse(
    fs.readFileSync(FIXTURE_PATH, "utf-8"),
  ) as VlmDirectRawResponse;
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

describe("Experiment 04 — VLM-direct workflow template (static)", () => {
  describe("template metadata", () => {
    it("declares the experiment-specific name and tags", () => {
      const graph = loadTemplate();
      expect(graph.metadata?.name).toBe("Experiment 04 - VLM-direct (gpt-5.4)");
      expect(graph.metadata?.tags).toEqual(
        expect.arrayContaining([
          "experiment",
          "experiment-04",
          "vlm-direct",
          "azure-openai",
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

    it("azureOpenAiDeployment default is gpt-5.4", () => {
      const graph = loadTemplate();
      expect(graph.ctx?.azureOpenAiDeployment?.defaultValue).toBe("gpt-5.4");
    });
  });

  describe("scope rules from the brief", () => {
    it("uses vlmDirect.extract — not Mistral, Azure DI, or CU paths", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).toContain("vlmDirect.extract");
      expect(types).not.toContain("azureContentUnderstanding.analyze");
      expect(types).not.toContain("mistralAzureOcr.process");
      expect(types).not.toContain("mistralOcr.process");
      expect(types).not.toContain("azureOcr.submit");
    });

    it("does not include LLM enrichment (out of scope for E04)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.enrich");
    });

    it("does not include cross-field validation (out of scope for E04)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.documentValidateFields");
    });

    it("does not chain a pollUntil node — chat completions is synchronous", () => {
      const graph = loadTemplate();
      const polls = Object.values(graph.nodes ?? {}).filter(
        (n) => n.type === "pollUntil",
      );
      expect(polls).toHaveLength(0);
    });

    it("does not include a PDF render activity (deferred to a follow-up)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("pdf.renderToImages");
    });
  });

  describe("chain wiring", () => {
    it("topological order matches the brief's sequence", () => {
      const graph = loadTemplate();
      const order = computeTopologicalOrder(graph);
      const idx = (id: string) => order.indexOf(id);
      const pairs: Array<[string, string]> = [
        ["prepareFileData", "vlmDirectExtract"],
        ["vlmDirectExtract", "postOcrCleanup"],
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

    it("VLM activity carries the configured timeout/retry shape (Foundry quota retry)", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmDirectExtract as ActivityNode | undefined;
      expect(node?.activityType).toBe("vlmDirect.extract");
      expect(node?.timeout?.startToClose).toBe("20m");
      // 30 attempts × 15 s × 1.5x × 60 s cap — mirrors the Foundry-quota
      // retry shape (CU + Mistral on Foundry).
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

    it("VLM activity wires templateModelId + azureOpenAiDeployment from ctx", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmDirectExtract as ActivityNode | undefined;
      const templateInput = node?.inputs?.find(
        (i) => i.port === "templateModelId",
      );
      expect(templateInput?.ctxKey).toBe("templateModelId");
      const deploymentInput = node?.inputs?.find(
        (i) => i.port === "azureOpenAiDeployment",
      );
      expect(deploymentInput?.ctxKey).toBe("azureOpenAiDeployment");
    });

    it("VLM activity emits both ocrResult and ocrResponse so persistOcrCache populates benchmark_ocr_cache", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmDirectExtract as ActivityNode | undefined;
      const outputPorts = (node?.outputs ?? []).map((o) => o.port);
      expect(outputPorts).toContain("ocrResult");
      expect(outputPorts).toContain("ocrResponse");
      expect(graph.ctx?.ocrResult).toBeDefined();
      expect(graph.ctx?.ocrResponse).toBeDefined();
    });

    it("VLM activity carries the iteration kit's prompt + per-field descriptions + numericFieldsNullable", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmDirectExtract as ActivityNode | undefined;
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

  describe("recorded VLM response (fixture)", () => {
    const describeFixture = fixtureExists() ? describe : describe.skip;

    describeFixture("when the captured VLM fixture is present", () => {
      it("fixture parses as a VlmDirectRawResponse with parsed { fields, source_quotes }", () => {
        const fixture = loadFixture();
        expect(fixture.deployment).toBeDefined();
        expect(fixture.parsed).toBeDefined();
        expect(typeof fixture.parsed.fields).toBe("object");
        expect(typeof fixture.parsed.source_quotes).toBe("object");
      });

      it("fixture's structured-output pass actually ran (every required field key is present)", () => {
        const fixture = loadFixture();
        const fieldKeys = Object.keys(fixture.parsed.fields ?? {});
        // Strict mode enforces all-fields-present; expect ≥ 70 of the 74-key SDPR schema.
        expect(fieldKeys.length).toBeGreaterThanOrEqual(70);
        const quoteKeys = Object.keys(fixture.parsed.source_quotes ?? {});
        expect(quoteKeys.length).toBe(fieldKeys.length);
      });

      // T4: use the REAL seeded template field types (DB), not a key-name
      // heuristic, so a number field that the heuristic would mis-type as a
      // string (dropping its valueNumber) is actually exercised. DB-gated.
      const itDb = process.env.CI ? it.skip : it;
      itDb(
        "mapper produces a valid OCRResult using the real seeded template field types, preserving numeric values",
        async () => {
          const fixture = loadFixture();
          const fieldDefs = await loadSeededFieldDefs();
          expect(fieldDefs.length).toBeGreaterThanOrEqual(70);
          const ocr = vlmExtractionToOcrResult(
            fixture.parsed,
            {
              fileName: "1 81.jpg",
              fileType: "image",
              requestId: "test",
              modelId: fixture.deployment ?? "gpt-5.4",
            },
            { fieldDefs },
          );
          expect(ocr.success).toBe(true);
          expect(ocr.extractedText.length).toBeGreaterThan(0);
          expect(ocr.pages.length).toBeGreaterThanOrEqual(1);
          expect(ocr.documents?.[0]?.docType).toBe("vlm-direct");

          // Every field the template types as a number and that the fixture
          // populated with a numeric value must carry a parsed `valueNumber`
          // (the silent-drop the old key-name heuristic could cause).
          const numberKeys = fieldDefs
            .filter((d) => d.field_type === "number")
            .map((d) => d.field_key);
          const docFields = ocr.documents?.[0]?.fields ?? {};
          const checkedNumeric = numberKeys.filter(
            (k) => typeof fixture.parsed.fields[k] === "number",
          );
          expect(checkedNumeric.length).toBeGreaterThan(0);
          for (const k of checkedNumeric) {
            expect(typeof docFields[k]?.valueNumber).toBe("number");
          }
        },
      );

      it("source_quotes back nearly every populated field (evidence signal is dense, not just > half)", () => {
        const fixture = loadFixture();
        const fields = fixture.parsed.fields ?? {};
        const quotes = fixture.parsed.source_quotes ?? {};
        const populated = Object.entries(fields).filter(
          ([, v]) => v !== null && v !== undefined && v !== "",
        );
        const evidenced = populated.filter(
          ([k]) => typeof quotes[k] === "string" && quotes[k].trim().length > 0,
        );
        // The sample populates a substantial number of fields, and gpt-5.4
        // quotes essentially all of them. Require a dense ratio (≥ 90%) so a
        // regression where the model stops emitting quotes actually fails
        // (the old `> populated/2` floor was near-vacuous).
        expect(populated.length).toBeGreaterThanOrEqual(20);
        expect(evidenced.length).toBeGreaterThanOrEqual(
          Math.ceil(populated.length * 0.9),
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
  "Experiment 04 — runtime against local Temporal cluster (mock only paid services)",
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

    it("high-confidence sample (all fields evidenced) skips human review and persists the result", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplate();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({
        vlm: {
          fields: { name: "John Smith" },
          source_quotes: { name: "John Smith" },
        },
      });
      const taskQueue = `e04-itest-high-${process.pid}-${Date.now()}`;
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
        const workflowId = `e04-itest-high-${Date.now()}`;
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

    it("low-confidence sample (populated field without evidence) routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplate();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({
        vlm: { fields: { name: "John Smith" }, source_quotes: {} },
      });
      const taskQueue = `e04-itest-low-${process.pid}-${Date.now()}`;
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
          workflowId: `e04-itest-low-${Date.now()}`,
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
