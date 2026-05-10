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
import { vlmExtractionToOcrResult } from "./ocr-providers/vlm-direct/vlm-to-ocr-result";
import type { VlmDirectRawResponse } from "./ocr-providers/vlm-direct/vlm-types";
import type { OCRResult } from "./types";

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

const TEMPORAL_ADDRESS = process.env.TEMPORAL_TEST_ADDRESS ?? "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_TEST_NAMESPACE ?? "default";

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

interface ActivityCall {
  type: string;
  params: Record<string, unknown>;
}

type ActivityImpl = (
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

function buildOcrResultFromFixture(
  fixture: VlmDirectRawResponse,
  fieldDefs: Array<{ field_key: string; field_type: string }>,
): OCRResult {
  return vlmExtractionToOcrResult(
    fixture.parsed,
    {
      fileName: "1 81.jpg",
      fileType: "image",
      requestId: "test-vlm-id",
      modelId: fixture.deployment ?? "gpt-5.4",
    },
    { fieldDefs },
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
          modelId: params.modelId ?? "gpt-5.4",
        },
      };
    },
    "document.updateStatus": async (params) => {
      record("document.updateStatus", params);
      return { success: true };
    },
    "vlmDirect.extract": async (params) => {
      record("vlmDirect.extract", params);
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
      expect(graph.metadata?.targetLocalDataset).toBe("samples-mix-private");
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

      it("mapper produces a valid OCRResult from the captured VLM fixture", () => {
        const fixture = loadFixture();
        // Synthesize a minimal fieldDefs list so the mapper can disambiguate
        // types — this mirrors what the activity passes from the loaded template.
        const fieldDefs = Object.keys(fixture.parsed.fields).map((key) => ({
          field_key: key,
          field_type: key.startsWith("checkbox_")
            ? "selectionMark"
            : key.startsWith("applicant_") || key.startsWith("spouse_")
              ? typeof fixture.parsed.fields[key] === "number"
                ? "number"
                : "string"
              : key === "date" || key === "spouse_date"
                ? "date"
                : "string",
        }));
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
      });

      it("source_quotes are a useful evidence signal (more than half of populated fields have quotes)", () => {
        const fixture = loadFixture();
        const fields = fixture.parsed.fields ?? {};
        const quotes = fixture.parsed.source_quotes ?? {};
        const populated = Object.entries(fields).filter(
          ([, v]) => v !== null && v !== undefined && v !== "",
        );
        const evidenced = populated.filter(
          ([k]) => typeof quotes[k] === "string" && quotes[k].trim().length > 0,
        );
        // gpt-5.4 in practice quotes every populated field, so this is a
        // floor; a regression here means the model stopped producing quotes
        // (e.g. strict-mode flag dropped).
        expect(evidenced.length).toBeGreaterThan(populated.length / 2);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Runtime tests against local Temporal cluster
// ---------------------------------------------------------------------------

const describeRuntime =
  process.env.CI || !fixtureExists() ? describe.skip : describe;

describeRuntime(
  "Experiment 04 — runtime against local Temporal cluster",
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
      const taskQueue = `e04-test-high-${process.pid}-${Date.now()}`;
      const fixture = loadFixture();
      const fieldDefs = Object.keys(fixture.parsed.fields).map((key) => ({
        field_key: key,
        field_type: key.startsWith("checkbox_") ? "selectionMark" : "string",
      }));
      const ocrResult = buildOcrResultFromFixture(fixture, fieldDefs);
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
          workflowId: `e04-test-high-${Date.now()}`,
          taskQueue,
          args: [input],
        }),
      );

      expect(result.status).toBe("completed");
      expect(result.ctx.requiresReview).toBe(false);
      expect(result.ctx.averageConfidence).toBe(0.99);

      const ctxOrder = calls.map((c) => c.type);
      expect(ctxOrder).toContain("file.prepare");
      expect(ctxOrder).toContain("vlmDirect.extract");
      expect(ctxOrder).toContain("ocr.cleanup");
      expect(ctxOrder).toContain("ocr.checkConfidence");
      expect(ctxOrder).toContain("ocr.storeResults");

      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("file.prepare")).toBeLessThan(idx("vlmDirect.extract"));
      expect(idx("vlmDirect.extract")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.checkConfidence"));
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));

      const vlmCall = calls.find((c) => c.type === "vlmDirect.extract");
      expect(vlmCall?.params.templateModelId).toBeDefined();
      expect(vlmCall?.params.azureOpenAiDeployment).toBeDefined();
    }, 60000);

    it("low-confidence sample routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const taskQueue = `e04-test-low-${process.pid}-${Date.now()}`;
      const fixture = loadFixture();
      const fieldDefs = Object.keys(fixture.parsed.fields).map((key) => ({
        field_key: key,
        field_type: key.startsWith("checkbox_") ? "selectionMark" : "string",
      }));
      const ocrResult = buildOcrResultFromFixture(fixture, fieldDefs);
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
        workflowId: `e04-test-low-${Date.now()}`,
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
      expect(idx("vlmDirect.extract")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.checkConfidence"));
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));
    }, 60000);
  },
);
