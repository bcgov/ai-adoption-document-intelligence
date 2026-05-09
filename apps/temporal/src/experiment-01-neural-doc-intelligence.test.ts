/**
 * Experiment 01 — Neural Document Intelligence + post-processing
 *
 * Two-layer test suite for the
 * `docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json`
 * template:
 *
 *   1. **Static + structural** assertions on the JSON template (cheap, no
 *      Temporal connection): metadata, scope rules, chain wiring, schema
 *      validation, and consistency with the recorded neural-OCR fixture.
 *   2. **Runtime end-to-end** workflow execution against a real local
 *      Temporal cluster (`localhost:7233`, the dev docker stack). Loads the
 *      JSON template, runs the actual `graphWorkflow` workflow, and replays
 *      a recorded neural-model OCR response through mocked activities. Both
 *      branches of the `reviewSwitch` are exercised: high-confidence skips
 *      humanReview; low-confidence routes through humanReview, gets a
 *      `humanApproval` signal, then completes via `storeResults`.
 *
 * The OCR fixture is a real Azure DI poll response from
 * `seed-local-samples-mix-private-v1` sample "1 81" run against
 * model `sdpr_synth_test` during benchmark run
 * `2295feed-1c99-493e-ae20-546499b5d685`.
 *
 * Note on `TestWorkflowEnvironment`: both `createTimeSkipping` and
 * `createLocal` lazily download Temporal binaries from temporal.download,
 * which TLS-fails in this dev environment. Connecting to the already-running
 * dev-stack Temporal at `localhost:7233` sidesteps the download entirely and
 * is the documented pattern for experiment branches in
 * `experiments/briefs/_shared-rules.md`.
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
import type { OCRResult } from "./types";

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "docs-md",
  "graph-workflows",
  "templates",
  "experiment-01-neural-doc-intelligence-workflow.json",
);
const FIXTURE_PATH = path.join(
  __dirname,
  "__fixtures__",
  "experiment-01",
  "neural-ocr-response-1-81.json",
);

const TEMPORAL_ADDRESS = process.env.TEMPORAL_TEST_ADDRESS ?? "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_TEST_NAMESPACE ?? "default";

// ---------------------------------------------------------------------------
// Fixture types + loaders
// ---------------------------------------------------------------------------

interface NeuralPollResponse {
  status: string;
  analyzeResult: {
    modelId: string;
    pages: unknown[];
    tables: unknown[];
    documents: Array<{
      docType: string;
      confidence: number;
      fields: Record<
        string,
        { content?: string; confidence?: number; type?: string }
      >;
    }>;
    content: string;
  };
}

function loadTemplate(): GraphWorkflowConfig {
  return JSON.parse(
    fs.readFileSync(TEMPLATE_PATH, "utf-8"),
  ) as GraphWorkflowConfig;
}

function loadFixture(): NeuralPollResponse {
  return JSON.parse(
    fs.readFileSync(FIXTURE_PATH, "utf-8"),
  ) as NeuralPollResponse;
}

/**
 * Load the template and shrink the `pollOcrResults` interval/initialDelay so
 * runtime tests don't pay the production 5s/10s wait. Mocked
 * `azureOcr.poll` returns "succeeded" on the first call so a 1ms interval
 * is enough.
 */
function loadTemplateForRuntime(): GraphWorkflowConfig {
  const graph = loadTemplate();
  const poll = graph.nodes?.pollOcrResults as PollUntilNode | undefined;
  if (poll) {
    poll.initialDelay = "1ms";
    poll.interval = "1ms";
  }
  return graph;
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

/** Build a well-formed `OCRResult` from the recorded Azure DI fixture. */
function buildOcrResultFromFixture(fixture: NeuralPollResponse): OCRResult {
  const doc = fixture.analyzeResult.documents[0];
  const fieldEntries = Object.entries(doc.fields).map(([key, raw]) => ({
    key,
    content: raw.content ?? "",
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0.99,
  }));

  return {
    success: true,
    status: "succeeded",
    apimRequestId: "test-apim-request-id",
    fileName: "1 81.jpg",
    fileType: "image",
    modelId: fixture.analyzeResult.modelId,
    extractedText: fixture.analyzeResult.content ?? "",
    pages: [
      {
        pageNumber: 1,
        words: fieldEntries.map((f) => ({
          content: f.content,
          confidence: f.confidence,
          polygon: [],
        })),
        lines: [],
        selectionMarks: [],
        unit: "pixel",
        width: 1700,
        height: 2200,
      } as unknown as OCRResult["pages"][number],
    ],
    tables: [],
    paragraphs: [],
    keyValuePairs: fieldEntries.map((f) => ({
      key: { content: f.key, confidence: f.confidence, polygon: [] },
      value: { content: f.content, confidence: f.confidence, polygon: [] },
      confidence: f.confidence,
    })) as unknown as OCRResult["keyValuePairs"],
    sections: [],
    figures: [],
    documents: [
      {
        docType: doc.docType,
        confidence: doc.confidence,
        fields: doc.fields,
      } as unknown as NonNullable<OCRResult["documents"]>[number],
    ],
    processedAt: new Date().toISOString(),
  };
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
          modelId: params.modelId ?? "sdpr_synth_test",
        },
      };
    },
    "azureOcr.submit": async (params) => {
      record("azureOcr.submit", params);
      return { apimRequestId: "test-apim-request-id" };
    },
    "document.updateStatus": async (params) => {
      record("document.updateStatus", params);
      return { success: true };
    },
    "azureOcr.poll": async (params) => {
      record("azureOcr.poll", params);
      return { response: { status: "succeeded" } };
    },
    "azureOcr.extract": async (params) => {
      record("azureOcr.extract", params);
      return { ocrResult };
    },
    "ocr.cleanup": async (params) => {
      record("ocr.cleanup", params);
      return { cleanedResult: ocrResult };
    },
    "ocr.normalizeFields": async (params) => {
      record("ocr.normalizeFields", params);
      return { ocrResult };
    },
    "ocr.characterConfusion": async (params) => {
      record("ocr.characterConfusion", params);
      return { ocrResult };
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

describe("Experiment 01 — neural DI workflow template (static)", () => {
  describe("template metadata", () => {
    it("declares the experiment-specific name and tags", () => {
      const graph = loadTemplate();
      expect(graph.metadata?.name).toBe(
        "Experiment 01 - Neural DI + Post-Processing",
      );
      expect(graph.metadata?.tags).toEqual(
        expect.arrayContaining(["experiment", "experiment-01", "neural"]),
      );
    });

    it("targets the seeded local dataset", () => {
      const graph = loadTemplate() as GraphWorkflowConfig & {
        metadata?: { targetLocalDataset?: string };
      };
      expect(graph.metadata?.targetLocalDataset).toBe("samples-mix-private");
    });

    it("uses the trained neural model id as the modelId default", () => {
      const graph = loadTemplate();
      expect(graph.ctx?.modelId?.defaultValue).toBe("sdpr_synth_test");
    });

    it("entry node is prepareFileData", () => {
      const graph = loadTemplate();
      expect(graph.entryNodeId).toBe("prepareFileData");
    });
  });

  describe("scope rules from the brief", () => {
    it("does not include the spellcheck node (dropped)", () => {
      const graph = loadTemplate();
      expect(graph.nodes?.spellcheck).toBeUndefined();
      expect(activityTypes(graph)).not.toContain("ocr.spellcheck");
    });

    it("does not include LLM enrichment (out of scope for E01)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.enrich");
    });

    it("does not include cross-field validation (out of scope for E01)", () => {
      const graph = loadTemplate();
      expect(activityTypes(graph)).not.toContain("ocr.documentValidateFields");
    });

    it("characterConfusion connects directly to checkConfidence (bridges the dropped spellcheck)", () => {
      const graph = loadTemplate();
      expect(
        findEdge(graph, "characterConfusion", "checkConfidence"),
      ).toBeDefined();
      expect(
        findEdge(graph, "characterConfusion", "spellcheck"),
      ).toBeUndefined();
      expect(findEdge(graph, "spellcheck", "checkConfidence")).toBeUndefined();
    });
  });

  describe("chain wiring", () => {
    it("topological order matches the brief sequence through reviewSwitch", () => {
      const graph = loadTemplate();
      const order = computeTopologicalOrder(graph);

      const idx = (id: string) => order.indexOf(id);
      // Linear chain (all `normal` edges) — these must be strictly ordered.
      // `storeResults` and `humanReview` are reached via `conditional` edges
      // from reviewSwitch which the topo sort intentionally excludes; their
      // wiring is checked separately in the review switch test.
      const pairs: Array<[string, string]> = [
        ["prepareFileData", "submitOcr"],
        ["submitOcr", "updateApimRequestId"],
        ["updateApimRequestId", "pollOcrResults"],
        ["pollOcrResults", "extractResults"],
        ["extractResults", "postOcrCleanup"],
        ["postOcrCleanup", "normalizeFields"],
        ["normalizeFields", "characterConfusion"],
        ["characterConfusion", "checkConfidence"],
        ["checkConfidence", "reviewSwitch"],
      ];
      for (const [before, after] of pairs) {
        expect(idx(before)).toBeGreaterThanOrEqual(0);
        expect(idx(after)).toBeGreaterThan(idx(before));
      }
    });

    it("uses the async azureOcr submit/poll/extract pattern", () => {
      const graph = loadTemplate();
      const types = activityTypes(graph);
      expect(types).toContain("azureOcr.submit");
      expect(types).toContain("azureOcr.poll");
      expect(types).toContain("azureOcr.extract");
      expect(types).not.toContain("azureOcr.process"); // sync pattern not used here
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

    it("characterConfusion node carries the configured field scope", () => {
      const graph = loadTemplate();
      const cc = graph.nodes?.characterConfusion as ActivityNode | undefined;
      expect(cc?.activityType).toBe("ocr.characterConfusion");
      const params = (cc?.parameters ?? {}) as Record<string, unknown>;
      const fieldScope = params.fieldScope as string[] | undefined;
      expect(Array.isArray(fieldScope)).toBe(true);
      expect((fieldScope ?? []).length).toBeGreaterThan(0);
      expect(fieldScope).toContain("applicant_oas_gis");
      expect(typeof params.confusionProfileId).toBe("string");
      expect(typeof params.documentType).toBe("string");
    });

    it("ocr.checkConfidence reads its threshold from ctx.confidenceThreshold (default 0.95)", () => {
      const graph = loadTemplate();
      expect(graph.ctx?.confidenceThreshold?.defaultValue).toBe(0.95);
      const node = graph.nodes?.checkConfidence as ActivityNode | undefined;
      const thresholdInput = node?.inputs?.find((i) => i.port === "threshold");
      expect(thresholdInput?.ctxKey).toBe("confidenceThreshold");
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

  describe("recorded neural OCR response", () => {
    it("fixture is the trained model output and matches the template modelId default", () => {
      const fixture = loadFixture();
      const graph = loadTemplate();
      expect(fixture.status).toBe("succeeded");
      expect(fixture.analyzeResult.modelId).toBe(
        graph.ctx?.modelId?.defaultValue,
      );
      expect(fixture.analyzeResult.documents.length).toBeGreaterThan(0);
      expect(fixture.analyzeResult.documents[0].docType).toMatch(
        /^sdpr_synth_test/,
      );
    });

    it("fixture exposes per-field confidences in the [0,1] range expected by ocr.checkConfidence", () => {
      const fixture = loadFixture();
      const fields = fixture.analyzeResult.documents[0].fields;
      const confidences = Object.values(fields)
        .map((f) => f.confidence)
        .filter((c): c is number => typeof c === "number");

      expect(confidences.length).toBeGreaterThan(0);
      for (const c of confidences) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    });

    it("fixture includes fields named in the template's characterConfusion fieldScope", () => {
      const graph = loadTemplate();
      const cc = graph.nodes?.characterConfusion as ActivityNode | undefined;
      const fieldScope = ((cc?.parameters ?? {}) as { fieldScope?: string[] })
        .fieldScope;
      expect(fieldScope).toBeDefined();

      const fixture = loadFixture();
      const fixtureFieldKeys = Object.keys(
        fixture.analyzeResult.documents[0].fields,
      );

      // At least one of the configured scope fields must exist in the model
      // output; otherwise the corrector would have nothing to operate on.
      const overlap = (fieldScope ?? []).filter((f) =>
        fixtureFieldKeys.includes(f),
      );
      expect(overlap.length).toBeGreaterThan(0);
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
  "Experiment 01 — runtime against local Temporal cluster",
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
      const taskQueue = `e01-test-high-${process.pid}-${Date.now()}`;
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

      const graph = loadTemplateForRuntime();
      const input = makeWorkflowInput(graph, {
        documentId: "test-doc-high-confidence",
        blobKey: "blobs/1-81.jpg",
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      });

      const result = await worker.runUntil(
        client.workflow.execute(graphWorkflow, {
          workflowId: `e01-test-high-${Date.now()}`,
          taskQueue,
          args: [input],
        }),
      );

      expect(result.status).toBe("completed");
      expect(result.ctx.requiresReview).toBe(false);
      expect(result.ctx.averageConfidence).toBe(0.99);

      // Note: pre-execution document.updateStatus runs first (graph engine
      // overhead), so we filter to ctx-driven activities for ordering.
      const ctxOrder = calls.map((c) => c.type);
      expect(ctxOrder).toContain("file.prepare");
      expect(ctxOrder).toContain("azureOcr.submit");
      expect(ctxOrder).toContain("azureOcr.poll");
      expect(ctxOrder).toContain("azureOcr.extract");
      expect(ctxOrder).toContain("ocr.cleanup");
      expect(ctxOrder).toContain("ocr.normalizeFields");
      expect(ctxOrder).toContain("ocr.characterConfusion");
      expect(ctxOrder).toContain("ocr.checkConfidence");
      expect(ctxOrder).toContain("ocr.storeResults");

      // Verify the chain order: each post-OCR step should appear after its
      // predecessor.
      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("file.prepare")).toBeLessThan(idx("azureOcr.submit"));
      expect(idx("azureOcr.submit")).toBeLessThan(idx("azureOcr.poll"));
      expect(idx("azureOcr.poll")).toBeLessThan(idx("azureOcr.extract"));
      expect(idx("azureOcr.extract")).toBeLessThan(idx("ocr.cleanup"));
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.normalizeFields"));
      expect(idx("ocr.normalizeFields")).toBeLessThan(
        idx("ocr.characterConfusion"),
      );
      expect(idx("ocr.characterConfusion")).toBeLessThan(
        idx("ocr.checkConfidence"),
      );
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));

      // Real neural-model OCR data flowed through cleanup unchanged.
      const cleanupCall = calls.find((c) => c.type === "ocr.cleanup");
      const cleanupOcr = cleanupCall?.params.ocrResult as OCRResult | undefined;
      expect(cleanupOcr?.modelId).toBe("sdpr_synth_test");
      expect(cleanupOcr?.documents?.[0]?.docType).toMatch(/^sdpr_synth_test/);

      // characterConfusion received the full configured field scope.
      const ccCall = calls.find((c) => c.type === "ocr.characterConfusion");
      const ccFieldScope = ccCall?.params.fieldScope as string[] | undefined;
      expect(Array.isArray(ccFieldScope)).toBe(true);
      expect(ccFieldScope).toContain("applicant_oas_gis");
    }, 60000);

    it("low-confidence sample routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const taskQueue = `e01-test-low-${process.pid}-${Date.now()}`;
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

      const graph = loadTemplateForRuntime();
      const input = makeWorkflowInput(graph, {
        documentId: "test-doc-low-confidence",
        blobKey: "blobs/1-81.jpg",
        fileName: "1 81.jpg",
        fileType: "image",
        contentType: "image/jpeg",
      });

      const handle = await client.workflow.start(graphWorkflow, {
        workflowId: `e01-test-low-${Date.now()}`,
        taskQueue,
        args: [input],
      });

      const resultPromise = handle.result();
      const runPromise = worker.runUntil(resultPromise);

      // Temporal queues the signal; humanGate consumes it once the workflow
      // reaches that node.
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

      // storeResults must still run, but only after the humanReview gate.
      expect(calls.map((c) => c.type)).toContain("ocr.storeResults");

      // The cleanup → checkConfidence chain ran in order even on the
      // low-confidence path.
      const ctxOrder = calls.map((c) => c.type);
      const idx = (t: string) => ctxOrder.indexOf(t);
      expect(idx("ocr.cleanup")).toBeLessThan(idx("ocr.normalizeFields"));
      expect(idx("ocr.normalizeFields")).toBeLessThan(
        idx("ocr.characterConfusion"),
      );
      expect(idx("ocr.characterConfusion")).toBeLessThan(
        idx("ocr.checkConfidence"),
      );
      expect(idx("ocr.checkConfidence")).toBeLessThan(idx("ocr.storeResults"));
    }, 60000);
  },
);
