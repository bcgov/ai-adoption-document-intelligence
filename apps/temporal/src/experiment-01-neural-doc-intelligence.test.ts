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
 * `seed-local-samples-mix-public-v1` sample "1 81" run against
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
import type { OCRResponse } from "./types";

/**
 * Build a small Azure DI analyze response whose page words all carry
 * `confidence`, fed to the real submit/poll/extract path via the harness's
 * MOCK_AZURE_OCR seam so the real gate is deterministic.
 */
function neuralDiResponse(confidence: number, wordCount: number): OCRResponse {
  const words = Array.from({ length: wordCount }, (_, i) => ({
    content: `w${i}`,
    confidence,
    polygon: [0, 0, 10, 0, 10, 10, 0, 10],
    span: { offset: i * 4, length: 2 },
  }));
  return {
    status: "succeeded",
    analyzeResult: {
      apiVersion: "2024-11-30",
      modelId: "sdpr_synth_test",
      content: words.map((w) => w.content).join(" "),
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words,
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [
        {
          docType: "sdpr_synth_test",
          confidence,
          fields: {
            applicant_oas_gis: {
              type: "number",
              content: "100",
              valueNumber: 100,
              confidence,
            },
          },
        },
      ],
    },
  } as unknown as OCRResponse;
}

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

// (Runtime tests use the shared mock-only-paid harness; no per-activity mocks.)

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
      expect(graph.metadata?.targetLocalDataset).toBe("samples-mix-public");
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
  "Experiment 01 — runtime against local Temporal cluster (mock only paid services)",
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

    it("high-confidence DI response skips human review and persists the result", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplateForRuntime();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({ di: neuralDiResponse(0.99, 10) });
      const taskQueue = `e01-itest-high-${process.pid}-${Date.now()}`;
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
        const workflowId = `e01-itest-high-${Date.now()}`;
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

    it("low-confidence DI response routes through humanReview before storeResults", async () => {
      if (!nativeConnection || !client) {
        throw new Error(
          `Temporal not reachable at ${TEMPORAL_ADDRESS}. Start the dev docker stack first.`,
        );
      }
      const graph = loadTemplateForRuntime();
      const { documentId, cleanup } = await seedTestDocument();
      const mocks = installPaidApiMocks({ di: neuralDiResponse(0.4, 10) });
      const taskQueue = `e01-itest-low-${process.pid}-${Date.now()}`;
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
          workflowId: `e01-itest-low-${Date.now()}`,
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
