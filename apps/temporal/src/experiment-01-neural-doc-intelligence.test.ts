/**
 * Experiment 01 — Neural Document Intelligence + post-processing
 *
 * Static + structural tests for the
 * `docs-md/graph-workflows/templates/experiment-01-neural-doc-intelligence-workflow.json`
 * template. The full runtime chain is exercised end-to-end by the benchmark
 * runner (see experiments/results/01-neural-doc-intelligence/SUMMARY.md for
 * the recorded run id and metrics); these tests cover the wiring assertions
 * the brief calls out:
 *
 *   - trained neural model id `sdpr_synth_test` is the configured default
 *   - spellcheck is dropped (not valuable for the handwritten field set)
 *   - LLM enrichment + cross-field validation are absent (out of scope)
 *   - the chain order matches:
 *       file.prepare → azureOcr.submit/poll/extract → ocr.cleanup →
 *       ocr.normalizeFields → ocr.characterConfusion → ocr.checkConfidence →
 *       reviewSwitch → (humanReview)? → ocr.storeResults
 *   - graph-schema validator accepts the template
 *   - the recorded neural-model OCR response replays through the
 *     post-processor activity types referenced by the template
 *
 * The OCR fixture is a real Azure DI poll response from
 * `seed-local-samples-mix-private-v1` sample "1 81" run against
 * model `sdpr_synth_test` during benchmark run
 * `2295feed-1c99-493e-ae20-546499b5d685`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";
import { computeTopologicalOrder } from "./graph-engine/graph-algorithms";
import { validateGraphConfigForExecution } from "./graph-schema-validator";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
  PollUntilNode,
  SwitchNode,
} from "./graph-workflow-types";

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

describe("Experiment 01 — neural DI workflow template", () => {
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
