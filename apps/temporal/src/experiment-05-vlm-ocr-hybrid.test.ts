/**
 * Experiment 05 — VLM + OCR hybrid (gpt-5.4)
 *
 * Two-layer test suite for the
 * `docs-md/graph-workflows/templates/experiment-05-vlm-ocr-hybrid-workflow.json`
 * template:
 *
 *   1. **Static + structural** assertions on the JSON template (no
 *      Temporal connection): metadata, scope rules (uses
 *      vlmOcrHybrid.extract + azureOcr.readPlain; not Mistral/CU/E04
 *      paths), chain wiring (DI read-plain runs before the VLM call),
 *      ctx + outputs wiring (incl. the layoutResponse handoff and the
 *      ocrResponse port that drives benchmark_ocr_cache), schema
 *      validation, and consistency with the recorded DI layout fixture.
 *   2. **Trust-hierarchy stress test** — feeds the prompt builder a
 *      deliberately-wrong OCR markdown alongside a (mocked) image and
 *      asserts the system prompt + delimiters + directive that make
 *      "prefer the image" a hard contract are present. We can't run a
 *      paid model in unit tests, so this is a contract-level check that
 *      the mechanism that produces the trust-hierarchy behaviour is
 *      wired correctly. End-to-end accuracy is asserted in the
 *      benchmark, not here.
 *   3. **Runtime end-to-end** workflow execution against a real local
 *      Temporal cluster (`localhost:7233`). Loads the JSON template,
 *      runs the actual `graphWorkflow` workflow, and replays the
 *      captured DI layout fixture + a synthetic VLM payload through
 *      mocked activities. Both branches of the `reviewSwitch` are
 *      exercised. CI-gated + fixture-gated.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { computeConfigHash } from "./config-hash";
import { computeTopologicalOrder } from "./graph-engine/graph-algorithms";
import { validateGraphConfigForExecution } from "./graph-schema-validator";
import { getStatus, graphWorkflow } from "./graph-workflow";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
  GraphWorkflowInput,
  PollUntilNode,
  SwitchNode,
} from "./graph-workflow-types";
import { ocrLayoutToMarkdown } from "./ocr-providers/vlm-ocr-hybrid/ocr-to-markdown";
import { buildVlmHybridExtractionRequest } from "./ocr-providers/vlm-ocr-hybrid/vlm-hybrid-prompt-builder";
import { vlmHybridExtractionToOcrResult } from "./ocr-providers/vlm-ocr-hybrid/vlm-hybrid-to-ocr-result";
import type { OCRResponse, OCRResult } from "./types";

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "docs-md",
  "graph-workflows",
  "templates",
  "experiment-05-vlm-ocr-hybrid-workflow.json",
);
const FIXTURES_DIR = path.join(__dirname, "__fixtures__", "experiment-05");
const LAYOUT_FIXTURE_PATH = path.join(FIXTURES_DIR, "di-layout-1-81.json");
const HYBRID_FIXTURE_PATH = path.join(
  FIXTURES_DIR,
  "vlm-hybrid-response-1-81.json",
);

const TEMPORAL_ADDRESS = process.env.TEMPORAL_TEST_ADDRESS ?? "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_TEST_NAMESPACE ?? "default";

function loadTemplate(): GraphWorkflowConfig {
  return JSON.parse(
    fs.readFileSync(TEMPLATE_PATH, "utf-8"),
  ) as GraphWorkflowConfig;
}

function layoutFixtureExists(): boolean {
  return fs.existsSync(LAYOUT_FIXTURE_PATH);
}

function hybridFixtureExists(): boolean {
  return fs.existsSync(HYBRID_FIXTURE_PATH);
}

function loadLayoutFixture(): OCRResponse {
  return JSON.parse(
    fs.readFileSync(LAYOUT_FIXTURE_PATH, "utf-8"),
  ) as OCRResponse;
}

interface HybridFixture {
  deployment: string;
  apiVersion: string;
  durationMs: number;
  vlmDurationMs: number;
  parsed: {
    fields: Record<string, unknown>;
    source_quotes: Record<string, string>;
  };
  raw: Record<string, unknown>;
  layoutResponse: OCRResponse;
  ocrMarkdown: string;
}

function loadHybridFixture(): HybridFixture {
  return JSON.parse(
    fs.readFileSync(HYBRID_FIXTURE_PATH, "utf-8"),
  ) as HybridFixture;
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
  payload: HybridFixture["parsed"],
  layout: OCRResponse,
): OCRResult {
  const fieldDefs = Object.keys(payload.fields).map((key) => ({
    field_key: key,
    field_type: key.startsWith("checkbox_") ? "selectionMark" : "string",
  }));
  return vlmHybridExtractionToOcrResult(
    payload as {
      fields: Record<string, string | number | null>;
      source_quotes: Record<string, string>;
    },
    {
      fileName: "1 81.jpg",
      fileType: "image",
      requestId: "test-hybrid-id",
      modelId: "gpt-5.4",
    },
    { fieldDefs, layoutResponse: layout },
  );
}

function buildMockActivities(opts: {
  layoutResponse: OCRResponse;
  ocrResult: OCRResult;
  averageConfidence: number;
  requiresReview: boolean;
  callsRef: ActivityCall[];
}): Record<string, ActivityImpl> {
  const {
    layoutResponse,
    ocrResult,
    averageConfidence,
    requiresReview,
    callsRef,
  } = opts;
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
    "azureOcr.readPlain": async (params) => {
      record("azureOcr.readPlain", params);
      return { layoutResponse };
    },
    "vlmOcrHybrid.extract": async (params) => {
      record("vlmOcrHybrid.extract", params);
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

type TestGraphWorkflowInput = GraphWorkflowInput & {
  __testGraph: GraphWorkflowConfig;
};

function makeWorkflowInput(
  graph: GraphWorkflowConfig,
  initialCtx: Record<string, unknown>,
): TestGraphWorkflowInput {
  return {
    workflowVersionId: "test-workflow-version-id",
    initialCtx,
    configHash: computeConfigHash(graph),
    runnerVersion: "1.0.0",
    __testGraph: graph,
  };
}

/**
 * Mock getWorkflowGraphConfig so the workflow loads the test graph by id
 * (develop moved from inline-graph input to DB-loaded-by-workflowVersionId).
 */
function withGraphConfigLoader(
  activities: Record<string, ActivityImpl>,
  graph: GraphWorkflowConfig,
): Record<string, ActivityImpl> {
  activities.getWorkflowGraphConfig = (async () => ({
    graph,
    workflowVersionId: "test-workflow-version-id",
    configHash: computeConfigHash(graph),
  })) as unknown as ActivityImpl;
  // develop's workflow runs a post-execution hook that reads document.getStatus;
  // mock it so the workflow closes cleanly (else the trailing failed activity
  // adds noise and can race the terminal getStatus query).
  if (!activities["document.getStatus"]) {
    activities["document.getStatus"] = (async () => ({
      status: "extracted",
    })) as unknown as ActivityImpl;
  }
  return activities;
}

// ---------------------------------------------------------------------------
// Static + structural tests
// ---------------------------------------------------------------------------

describe("Experiment 05 — VLM + OCR hybrid workflow template (static)", () => {
  describe("template metadata", () => {
    it("declares the experiment-specific name and tags", () => {
      const graph = loadTemplate();
      expect(graph.metadata?.name).toBe(
        "Experiment 05 - VLM + OCR hybrid (gpt-5.4)",
      );
      expect(graph.metadata?.tags).toEqual(
        expect.arrayContaining([
          "experiment",
          "experiment-05",
          "vlm-ocr-hybrid",
          "azure-openai",
          "azure-document-intelligence",
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
    it("uses vlmOcrHybrid.extract + azureOcr.readPlain — not Mistral, CU, or pure VLM-direct paths", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).toContain("azureOcr.readPlain");
      expect(types).toContain("vlmOcrHybrid.extract");
      expect(types).not.toContain("vlmDirect.extract");
      expect(types).not.toContain("azureContentUnderstanding.analyze");
      expect(types).not.toContain("mistralAzureOcr.process");
      expect(types).not.toContain("mistralOcr.process");
      // `azureOcr.submit/poll/extract` is the field-extraction (custom-model) path; the hybrid uses the plain layout wrapper instead.
      expect(types).not.toContain("azureOcr.submit");
    });

    it("does not include LLM enrichment (out of scope for E05)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.enrich");
    });

    it("does not include cross-field validation (out of scope for E05)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.documentValidateFields");
    });

    it("does not chain a pollUntil node — the DI read wrapper polls inline", () => {
      const graph = loadTemplate();
      const polls = Object.values(graph.nodes ?? {}).filter(
        (n) => n.type === "pollUntil",
      );
      expect(polls).toHaveLength(0);
    });

    it("does not include a PDF render activity (deferred per the SCOPE REDUCTION)", () => {
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
        ["prepareFileData", "azureDiReadPlain"],
        ["azureDiReadPlain", "vlmOcrHybridExtract"],
        ["vlmOcrHybridExtract", "postOcrCleanup"],
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

    it("DI read activity has a generous-but-bounded retry shape", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.azureDiReadPlain as ActivityNode | undefined;
      expect(node?.activityType).toBe("azureOcr.readPlain");
      // Sync wrapper, ~1-3 s/page; allow at least 3 attempts.
      expect(node?.retry?.maximumAttempts).toBeGreaterThanOrEqual(3);
    });

    it("VLM hybrid activity carries the configured timeout/retry shape (Foundry quota retry)", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmOcrHybridExtract as ActivityNode | undefined;
      expect(node?.activityType).toBe("vlmOcrHybrid.extract");
      expect(node?.timeout?.startToClose).toBe("20m");
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

    it("DI read activity emits layoutResponse on ctx.layoutResponse", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.azureDiReadPlain as ActivityNode | undefined;
      const outputs = (node?.outputs ?? []).map((o) => o.port);
      expect(outputs).toContain("layoutResponse");
      expect(graph.ctx?.layoutResponse).toBeDefined();
    });

    it("VLM hybrid activity wires fileData + layoutResponse + templateModelId + azureOpenAiDeployment from ctx", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmOcrHybridExtract as ActivityNode | undefined;
      const portToCtx = new Map(
        (node?.inputs ?? []).map((i) => [i.port, i.ctxKey]),
      );
      expect(portToCtx.get("fileData")).toBe("preparedFileData");
      expect(portToCtx.get("layoutResponse")).toBe("layoutResponse");
      expect(portToCtx.get("templateModelId")).toBe("templateModelId");
      expect(portToCtx.get("azureOpenAiDeployment")).toBe(
        "azureOpenAiDeployment",
      );
    });

    it("VLM hybrid activity emits both ocrResult and ocrResponse so persistOcrCache populates benchmark_ocr_cache", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmOcrHybridExtract as ActivityNode | undefined;
      const outputPorts = (node?.outputs ?? []).map((o) => o.port);
      expect(outputPorts).toContain("ocrResult");
      expect(outputPorts).toContain("ocrResponse");
      expect(graph.ctx?.ocrResult).toBeDefined();
      expect(graph.ctx?.ocrResponse).toBeDefined();
    });

    it("VLM hybrid activity carries the iteration kit's prompt + per-field descriptions + numericFieldsNullable", () => {
      const graph = loadTemplate();
      const node = graph.nodes?.vlmOcrHybridExtract as ActivityNode | undefined;
      const params = (node?.parameters ?? {}) as {
        documentAnnotationPrompt?: string;
        fieldDescriptions?: Record<string, string>;
        numericFieldsNullable?: boolean;
      };
      expect(params.documentAnnotationPrompt?.length ?? 0).toBeGreaterThan(100);
      expect(params.documentAnnotationPrompt).toMatch(/SDPR|Applicant|Spouse/);
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

  describe("trust-hierarchy stress test (contract)", () => {
    // We can't run a paid model in unit tests, so we assert that the
    // mechanism that makes the model prefer the image is wired
    // correctly: the system prompt names the rule, the user prompt
    // delimits the OCR text, and feeding deliberately-wrong OCR text
    // does not corrupt the schema. Aggregated end-to-end accuracy is
    // verified by the benchmark, not here.
    it("inlines deliberately-wrong OCR text without polluting the schema, and instructs the model to prefer the image", () => {
      const wrongOcr =
        "## OCR (deliberately wrong)\nNet Employment Income: 9181\nApplicant Name: Wrong Name";
      const req = buildVlmHybridExtractionRequest({
        fields: [
          { field_key: "name", field_type: "string" },
          {
            field_key: "applicant_net_employment_income",
            field_type: "number",
          },
        ],
        ocrMarkdown: wrongOcr,
      });
      expect(req).not.toBeNull();
      expect(req?.userPrompt).toContain(wrongOcr);
      expect(req?.userPrompt).toMatch(
        /When the image and the OCR text disagree, prefer the image/,
      );
      expect(req?.systemPrompt).toMatch(
        /trust what you see in the image and ignore the OCR text/i,
      );
      // Schema is unaffected by wrong OCR content.
      const schema = req?.responseFormat?.schema;
      expect(schema?.properties?.fields?.required).toEqual([
        "name",
        "applicant_net_employment_income",
      ]);
      expect(schema?.additionalProperties).toBe(false);
    });
  });

  describe("recorded DI layout (fixture)", () => {
    const describeFixture = layoutFixtureExists() ? describe : describe.skip;

    describeFixture("when the captured DI layout fixture is present", () => {
      it("fixture parses as an OCRResponse with analyzeResult", () => {
        const fixture = loadLayoutFixture();
        expect(fixture.status).toBe("succeeded");
        expect(fixture.analyzeResult).toBeDefined();
        expect(typeof fixture.analyzeResult?.content).toBe("string");
      });

      it("fixture has populated pages with words and lines", () => {
        const fixture = loadLayoutFixture();
        const pages = fixture.analyzeResult?.pages ?? [];
        expect(pages.length).toBeGreaterThan(0);
        expect(pages[0].words.length).toBeGreaterThan(0);
        expect(pages[0].lines.length).toBeGreaterThan(0);
      });

      it("ocrLayoutToMarkdown returns non-empty markdown by default", () => {
        const fixture = loadLayoutFixture();
        const md = ocrLayoutToMarkdown(fixture);
        expect(md.length).toBeGreaterThan(100);
      });

      it("with bbox annotations, returns annotated lines", () => {
        const fixture = loadLayoutFixture();
        const md = ocrLayoutToMarkdown(fixture, {
          includeBboxAnnotations: true,
        });
        expect(md).toContain("<bbox");
      });
    });
  });

  describe("recorded VLM-hybrid response (fixture)", () => {
    const describeFixture = hybridFixtureExists() ? describe : describe.skip;

    describeFixture("when the captured hybrid fixture is present", () => {
      it("fixture parses with both layoutResponse and parsed { fields, source_quotes }", () => {
        const fixture = loadHybridFixture();
        expect(fixture.deployment).toBeDefined();
        expect(fixture.parsed).toBeDefined();
        expect(typeof fixture.parsed.fields).toBe("object");
        expect(typeof fixture.parsed.source_quotes).toBe("object");
        expect(fixture.layoutResponse).toBeDefined();
      });

      it("structured-output pass actually ran (≥ 70 of 74 SDPR field keys present)", () => {
        const fixture = loadHybridFixture();
        const fieldKeys = Object.keys(fixture.parsed.fields ?? {});
        expect(fieldKeys.length).toBeGreaterThanOrEqual(70);
        const quoteKeys = Object.keys(fixture.parsed.source_quotes ?? {});
        expect(quoteKeys.length).toBe(fieldKeys.length);
      });

      it("mapper produces a valid OCRResult with bbox-populated pages from layout", () => {
        const fixture = loadHybridFixture();
        const ocr = buildOcrResultFromFixture(
          fixture.parsed,
          fixture.layoutResponse,
        );
        expect(ocr.success).toBe(true);
        expect(ocr.documents?.[0]?.docType).toBe("vlm-ocr-hybrid");
        expect(ocr.pages.length).toBeGreaterThanOrEqual(1);
        // Hybrid OCRResult.pages should carry real DI lines/words (the
        // big improvement over E04's single synthesised page).
        expect(ocr.pages[0].lines.length).toBeGreaterThan(0);
        expect(ocr.pages[0].words.length).toBeGreaterThan(0);
      });

      it("source_quotes are a useful evidence signal (more than half of populated fields have quotes)", () => {
        const fixture = loadHybridFixture();
        const fields = fixture.parsed.fields ?? {};
        const quotes = fixture.parsed.source_quotes ?? {};
        const populated = Object.entries(fields).filter(
          ([, v]) => v !== null && v !== undefined && v !== "",
        );
        const evidenced = populated.filter(
          ([k]) => typeof quotes[k] === "string" && quotes[k].trim().length > 0,
        );
        expect(evidenced.length).toBeGreaterThan(populated.length / 2);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Runtime tests against local Temporal cluster
// ---------------------------------------------------------------------------

const describeRuntime =
  process.env.CI || !layoutFixtureExists() ? describe.skip : describe;

describeRuntime(
  "Experiment 05 — runtime against local Temporal cluster",
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
      const taskQueue = `e05-test-high-${process.pid}-${Date.now()}`;
      const layout = loadLayoutFixture();
      // Synthetic VLM payload — runtime tests don't depend on the
      // captured hybrid response (which may not exist yet on first
      // run); they verify wiring, not content.
      const fakeFields = { name: "John Smith" };
      const fakeQuotes = { name: "John Smith" };
      const ocrResult = buildOcrResultFromFixture(
        { fields: fakeFields, source_quotes: fakeQuotes },
        layout,
      );
      const calls: ActivityCall[] = [];
      const graph = loadTemplate();
      const activities = withGraphConfigLoader(
        buildMockActivities({
          layoutResponse: layout,
          ocrResult,
          averageConfidence: 0.99,
          requiresReview: false,
          callsRef: calls,
        }),
        graph,
      );

      const worker = await Worker.create({
        connection: nativeConnection,
        namespace: TEMPORAL_NAMESPACE,
        taskQueue,
        workflowsPath: require.resolve("./graph-workflow"),
        activities,
      });

      const { __testGraph: _graph, ...input } = makeWorkflowInput(graph, {
        documentId: "test-doc-high-confidence",
        blobKey: "blobs/1-81.jpg",
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      });

      const workflowId = `e05-test-high-${Date.now()}`;
      const activeClient = client;
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
      expect(ctx.averageConfidence).toBe(0.99);

      const ctxOrder = calls.map((c) => c.type);
      expect(ctxOrder).toContain("file.prepare");
      expect(ctxOrder).toContain("azureOcr.readPlain");
      expect(ctxOrder).toContain("vlmOcrHybrid.extract");
      expect(ctxOrder).toContain("ocr.cleanup");
      expect(ctxOrder).toContain("ocr.checkConfidence");
      expect(ctxOrder).toContain("ocr.storeResults");

      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("file.prepare")).toBeLessThan(idx("azureOcr.readPlain"));
      expect(idx("azureOcr.readPlain")).toBeLessThan(
        idx("vlmOcrHybrid.extract"),
      );
      expect(idx("vlmOcrHybrid.extract")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.checkConfidence"));
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));

      const hybridCall = calls.find((c) => c.type === "vlmOcrHybrid.extract");
      expect(hybridCall?.params.templateModelId).toBeDefined();
      expect(hybridCall?.params.azureOpenAiDeployment).toBeDefined();
      // The hybrid step receives the layout from the upstream readPlain
      // step (the central assertion that proves the chain is wired).
      expect(hybridCall?.params.layoutResponse).toBeDefined();
    }, 60000);

    it("low-confidence sample routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const taskQueue = `e05-test-low-${process.pid}-${Date.now()}`;
      const layout = loadLayoutFixture();
      const fakeFields = { name: "John Smith" };
      const fakeQuotes = { name: "John Smith" };
      const ocrResult = buildOcrResultFromFixture(
        { fields: fakeFields, source_quotes: fakeQuotes },
        layout,
      );
      const calls: ActivityCall[] = [];
      const graph = loadTemplate();
      const activities = withGraphConfigLoader(
        buildMockActivities({
          layoutResponse: layout,
          ocrResult,
          averageConfidence: 0.42,
          requiresReview: true,
          callsRef: calls,
        }),
        graph,
      );

      const worker = await Worker.create({
        connection: nativeConnection,
        namespace: TEMPORAL_NAMESPACE,
        taskQueue,
        workflowsPath: require.resolve("./graph-workflow"),
        activities,
      });

      const { __testGraph: _graph, ...input } = makeWorkflowInput(graph, {
        documentId: "test-doc-low-confidence",
        blobKey: "blobs/1-81.jpg",
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      });

      const handle = await client.workflow.start(graphWorkflow, {
        workflowId: `e05-test-low-${Date.now()}`,
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
      expect(ctx.averageConfidence).toBe(0.42);

      expect(calls.map((c) => c.type)).toContain("ocr.storeResults");

      const ctxOrder = calls.map((c) => c.type);
      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("azureOcr.readPlain")).toBeLessThan(
        idx("vlmOcrHybrid.extract"),
      );
      expect(idx("vlmOcrHybrid.extract")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.checkConfidence"));
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));
    }, 60000);
  },
);
