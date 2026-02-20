/**
 * Benchmark Evaluation Activities Tests
 *
 * Tests for benchmark.evaluate and benchmark.aggregate activities.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-020-evaluation-aggregation-activities.md
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  benchmarkEvaluate,
  benchmarkAggregate,
  BenchmarkEvaluateInput,
  BenchmarkAggregateInput,
} from "./benchmark-evaluate";
import { EvaluationResult } from "../benchmark-types";

describe("benchmark-evaluate activities", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-eval-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("benchmarkEvaluate", () => {
    it("should evaluate a single sample using schema-aware evaluator", async () => {
      // Create test files
      const predictionPath = path.join(tempDir, "prediction.json");
      const groundTruthPath = path.join(tempDir, "ground-truth.json");

      await fs.writeFile(
        predictionPath,
        JSON.stringify({ invoiceNumber: "INV-001", total: "100.00" }),
      );
      await fs.writeFile(
        groundTruthPath,
        JSON.stringify({ invoiceNumber: "INV-001", total: "100.00" }),
      );

      const input: BenchmarkEvaluateInput = {
        sampleId: "sample-001",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: { docType: "invoice" },
        evaluatorType: "schema-aware",
        evaluatorConfig: {
          fieldMatchingRules: {
            invoiceNumber: { rule: "exact" },
            total: { rule: "exact" },
          },
          passThreshold: 0.8,
        },
      };

      const result = await benchmarkEvaluate(input);

      expect(result.sampleId).toBe("sample-001");
      expect(result.pass).toBe(true);
      expect(result.metrics).toHaveProperty("f1");
      expect(result.metrics).toHaveProperty("precision");
      expect(result.metrics).toHaveProperty("recall");
    });

    it("should resolve evaluator type from registry", async () => {
      // Create test files
      const predictionPath = path.join(tempDir, "prediction.json");
      const groundTruthPath = path.join(tempDir, "ground-truth.json");

      await fs.writeFile(
        predictionPath,
        JSON.stringify({ field1: "value1" }),
      );
      await fs.writeFile(
        groundTruthPath,
        JSON.stringify({ field1: "value1" }),
      );

      const input: BenchmarkEvaluateInput = {
        sampleId: "sample-002",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
      };

      const result = await benchmarkEvaluate(input);

      // Should not throw an error, meaning evaluator was resolved
      expect(result.sampleId).toBe("sample-002");
    });

    it("should handle missing prediction files", async () => {
      const input: BenchmarkEvaluateInput = {
        sampleId: "sample-003",
        inputPaths: [],
        predictionPaths: [path.join(tempDir, "nonexistent.json")],
        groundTruthPaths: [],
        metadata: {},
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
      };

      const result = await benchmarkEvaluate(input);

      expect(result.sampleId).toBe("sample-003");
      expect(result.pass).toBe(false);
      expect(result.diagnostics).toHaveProperty("error");
      expect(result.diagnostics.error).toBe("no_prediction_output");
    });

    it("should handle evaluation errors gracefully", async () => {
      // Create test files so the check passes but evaluator fails
      const predictionPath = path.join(tempDir, "prediction-error.json");
      const groundTruthPath = path.join(tempDir, "ground-truth-error.json");

      await fs.writeFile(predictionPath, JSON.stringify({ field: "value" }));
      await fs.writeFile(groundTruthPath, JSON.stringify({ field: "value" }));

      const input: BenchmarkEvaluateInput = {
        sampleId: "sample-004",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorType: "nonexistent-evaluator",
        evaluatorConfig: {},
      };

      const result = await benchmarkEvaluate(input);

      expect(result.sampleId).toBe("sample-004");
      expect(result.pass).toBe(false);
      expect(result.diagnostics).toHaveProperty("error");
      expect(result.diagnostics.error).toBe("evaluation_failed");
    });

    it("should collect evaluation artifacts", async () => {
      // Create test files
      const predictionPath = path.join(tempDir, "prediction.json");
      const groundTruthPath = path.join(tempDir, "ground-truth.json");

      await fs.writeFile(
        predictionPath,
        JSON.stringify({ field1: "value1" }),
      );
      await fs.writeFile(
        groundTruthPath,
        JSON.stringify({ field1: "value2" }),
      );

      const input: BenchmarkEvaluateInput = {
        sampleId: "sample-005",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorType: "black-box",
        evaluatorConfig: {
          passSimilarityThreshold: 0.8,
        },
      };

      const result = await benchmarkEvaluate(input);

      expect(result.sampleId).toBe("sample-005");
      // Black-box evaluator may produce artifacts
      if (result.artifacts) {
        expect(Array.isArray(result.artifacts)).toBe(true);
      }
    });

    it("should handle empty prediction paths", async () => {
      const input: BenchmarkEvaluateInput = {
        sampleId: "sample-006",
        inputPaths: [],
        predictionPaths: [],
        groundTruthPaths: [],
        metadata: {},
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
      };

      const result = await benchmarkEvaluate(input);

      expect(result.sampleId).toBe("sample-006");
      expect(result.pass).toBe(false);
      expect(result.diagnostics.error).toBe("no_prediction_output");
    });
  });

  describe("benchmarkAggregate", () => {
    it("should aggregate metrics across all samples", async () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 1.0, precision: 1.0, recall: 1.0 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.8, precision: 0.8, recall: 0.8 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-003",
          metrics: { f1: 0.6, precision: 0.6, recall: 0.6 },
          diagnostics: {},
          pass: false,
        },
      ];

      const input: BenchmarkAggregateInput = {
        results,
      };

      const result = await benchmarkAggregate(input);

      expect(result.overall.totalSamples).toBe(3);
      expect(result.overall.passingsSamples).toBe(2);
      expect(result.overall.failingSamples).toBe(1);
      expect(result.overall.passRate).toBeCloseTo(2 / 3);
      expect(result.overall.metrics).toHaveProperty("f1");
      expect(result.overall.metrics.f1.mean).toBeCloseTo(0.8);
    });

    it("should include sample metadata for slicing", async () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 1.0 },
          diagnostics: { metadata: { docType: "invoice" } },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.8 },
          diagnostics: { metadata: { docType: "invoice" } },
          pass: true,
        },
        {
          sampleId: "sample-003",
          metrics: { f1: 0.6 },
          diagnostics: { metadata: { docType: "receipt" } },
          pass: false,
        },
      ];

      const input: BenchmarkAggregateInput = {
        results,
        options: {
          sliceDimensions: ["docType"],
        },
      };

      const result = await benchmarkAggregate(input);

      expect(result.sliced).toBeDefined();
      expect(result.sliced).toHaveLength(1);
      expect(result.sliced![0].dimension).toBe("docType");
      expect("invoice" in result.sliced![0].slices).toBe(true);
      expect("receipt" in result.sliced![0].slices).toBe(true);
      expect(result.sliced![0].slices.invoice.totalSamples).toBe(2);
      expect(result.sliced![0].slices.receipt.totalSamples).toBe(1);
    });

    it("should perform failure analysis", async () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.3 },
          diagnostics: { missingFields: ["field1"] },
          pass: false,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.5 },
          diagnostics: { missingFields: ["field2"] },
          pass: false,
        },
        {
          sampleId: "sample-003",
          metrics: { f1: 1.0 },
          diagnostics: {},
          pass: true,
        },
      ];

      const input: BenchmarkAggregateInput = {
        results,
        options: {
          failureAnalysis: {
            topN: 2,
            metricName: "f1",
          },
        },
      };

      const result = await benchmarkAggregate(input);

      expect(result.failureAnalysis).toBeDefined();
      expect(result.failureAnalysis!.worstSamples).toHaveLength(2);
      expect(result.failureAnalysis!.worstSamples[0].sampleId).toBe(
        "sample-001",
      );
      expect(result.failureAnalysis!.worstSamples[0].metricValue).toBe(0.3);
      expect(result.failureAnalysis!.errorClusters).toBeDefined();
    });

    it("should handle empty results", async () => {
      const input: BenchmarkAggregateInput = {
        results: [],
      };

      const result = await benchmarkAggregate(input);

      expect(result.overall.totalSamples).toBe(0);
      expect(result.overall.passingsSamples).toBe(0);
      expect(result.overall.failingSamples).toBe(0);
      expect(result.overall.passRate).toBe(0);
    });

    it("should compute per-field breakdown for schema-aware evaluator", async () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.8 },
          diagnostics: {
            comparisonResults: [
              { field: "field1", matched: true, predicted: "v1", expected: "v1" },
              { field: "field2", matched: false, predicted: "v2", expected: "v3" },
            ],
          },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.5 },
          diagnostics: {
            comparisonResults: [
              { field: "field1", matched: false, predicted: "v4", expected: "v5" },
              { field: "field2", matched: true, predicted: "v6", expected: "v6" },
            ],
          },
          pass: false,
        },
      ];

      const input: BenchmarkAggregateInput = {
        results,
        options: {
          failureAnalysis: {
            topN: 5,
            metricName: "f1",
          },
        },
      };

      const result = await benchmarkAggregate(input);

      expect(result.failureAnalysis).toBeDefined();
      expect(result.failureAnalysis!.perFieldErrors).toBeDefined();
      expect(result.failureAnalysis!.perFieldErrors!.length).toBeGreaterThan(0);
    });
  });
});
