/**
 * Benchmark Aggregation & Failure Analysis Tests
 *
 * Tests for metrics aggregation and failure analysis.
 * See feature-docs/003-benchmarking-system/user-stories/US-017-metrics-aggregation-failure-analysis.md
 */

import {
  aggregateResults,
  computeAggregatedMetrics,
  computePerFieldErrors,
  computeSlicedMetrics,
  computeStatistics,
  findWorstSamples,
  performFailureAnalysis,
} from "./benchmark-aggregation";
import { EvaluationResult } from "./benchmark-types";

describe("Benchmark Aggregation & Failure Analysis", () => {
  // -----------------------------------------------------------------------
  // Scenario 1: Compute dataset-level aggregate metrics
  // -----------------------------------------------------------------------
  describe("computeAggregatedMetrics", () => {
    it("computes mean, median, stdDev, and percentiles for each metric", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { accuracy: 0.95, precision: 0.9, recall: 0.85 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { accuracy: 0.9, precision: 0.85, recall: 0.8 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-003",
          metrics: { accuracy: 0.85, precision: 0.8, recall: 0.75 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-004",
          metrics: { accuracy: 0.8, precision: 0.75, recall: 0.7 },
          diagnostics: {},
          pass: false,
        },
        {
          sampleId: "sample-005",
          metrics: { accuracy: 0.75, precision: 0.7, recall: 0.65 },
          diagnostics: {},
          pass: false,
        },
      ];

      const aggregated = computeAggregatedMetrics(results);

      expect(aggregated.totalSamples).toBe(5);
      expect(aggregated.passingSamples).toBe(3);
      expect(aggregated.failingSamples).toBe(2);
      expect(aggregated.passRate).toBe(0.6);

      // Check accuracy metric statistics
      const accuracyStats = aggregated.metrics.accuracy;
      expect(accuracyStats).toBeDefined();
      expect(accuracyStats.mean).toBeCloseTo(0.85, 2);
      expect(accuracyStats.median).toBe(0.85);
      expect(accuracyStats.min).toBe(0.75);
      expect(accuracyStats.max).toBe(0.95);

      // All metrics should have statistics
      expect(aggregated.metrics.precision).toBeDefined();
      expect(aggregated.metrics.recall).toBeDefined();
    });

    it("handles samples with different metric sets", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.9, accuracy: 0.95 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.85 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-003",
          metrics: { accuracy: 0.8 },
          diagnostics: {},
          pass: false,
        },
      ];

      const aggregated = computeAggregatedMetrics(results);

      // F1 should have 2 values
      expect(aggregated.metrics.f1).toBeDefined();
      expect(aggregated.metrics.f1.mean).toBeCloseTo(0.875, 3);

      // Accuracy should have 2 values
      expect(aggregated.metrics.accuracy).toBeDefined();
      expect(aggregated.metrics.accuracy.mean).toBeCloseTo(0.875, 3);
    });
  });

  // -----------------------------------------------------------------------
  // Statistics computation
  // -----------------------------------------------------------------------
  describe("computeStatistics", () => {
    it("computes correct statistics for a set of values", () => {
      const values = [0.5, 0.6, 0.7, 0.8, 0.9];
      const stats = computeStatistics("test_metric", values);

      expect(stats.name).toBe("test_metric");
      expect(stats.mean).toBeCloseTo(0.7, 2);
      expect(stats.median).toBe(0.7);
      expect(stats.min).toBe(0.5);
      expect(stats.max).toBe(0.9);
      expect(stats.p25).toBeCloseTo(0.6, 2);
      expect(stats.p75).toBeCloseTo(0.8, 2);
    });

    it("handles single value", () => {
      const values = [0.95];
      const stats = computeStatistics("test_metric", values);

      expect(stats.mean).toBe(0.95);
      expect(stats.median).toBe(0.95);
      expect(stats.min).toBe(0.95);
      expect(stats.max).toBe(0.95);
      expect(stats.stdDev).toBe(0);
    });

    it("handles empty array", () => {
      const values: number[] = [];
      const stats = computeStatistics("test_metric", values);

      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
      expect(stats.stdDev).toBe(0);
    });

    it("computes percentiles correctly", () => {
      // Values from 0 to 100
      const values = Array.from({ length: 101 }, (_, i) => i);
      const stats = computeStatistics("test_metric", values);

      expect(stats.p5).toBeCloseTo(5, 0);
      expect(stats.p25).toBeCloseTo(25, 0);
      expect(stats.median).toBeCloseTo(50, 0);
      expect(stats.p75).toBeCloseTo(75, 0);
      expect(stats.p95).toBeCloseTo(95, 0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Top-N worst-performing samples
  // -----------------------------------------------------------------------
  describe("findWorstSamples", () => {
    const results: EvaluationResult[] = [
      {
        sampleId: "sample-001",
        metrics: { f1: 0.95, accuracy: 0.97 },
        diagnostics: { note: "good" },
        pass: true,
      },
      {
        sampleId: "sample-002",
        metrics: { f1: 0.45, accuracy: 0.5 },
        diagnostics: { note: "worst" },
        pass: false,
      },
      {
        sampleId: "sample-003",
        metrics: { f1: 0.85, accuracy: 0.88 },
        diagnostics: { note: "good" },
        pass: true,
      },
      {
        sampleId: "sample-004",
        metrics: { f1: 0.55, accuracy: 0.6 },
        diagnostics: { note: "bad" },
        pass: false,
      },
      {
        sampleId: "sample-005",
        metrics: { f1: 0.75, accuracy: 0.78 },
        diagnostics: { note: "ok" },
        pass: true,
      },
    ];

    it("identifies N samples with lowest scores on specified metric", () => {
      const worst = findWorstSamples(results, "f1", 3);

      expect(worst).toHaveLength(3);
      expect(worst[0].sampleId).toBe("sample-002");
      expect(worst[0].metricValue).toBe(0.45);
      expect(worst[1].sampleId).toBe("sample-004");
      expect(worst[1].metricValue).toBe(0.55);
      expect(worst[2].sampleId).toBe("sample-005");
      expect(worst[2].metricValue).toBe(0.75);
    });

    it("returns samples with their metrics and diagnostics", () => {
      const worst = findWorstSamples(results, "f1", 1);

      expect(worst[0].sampleId).toBe("sample-002");
      expect(worst[0].metricValue).toBe(0.45);
      expect(worst[0].metrics).toEqual({ f1: 0.45, accuracy: 0.5 });
      expect(worst[0].diagnostics).toEqual({ note: "worst" });
    });

    it("handles topN larger than result set", () => {
      const worst = findWorstSamples(results, "f1", 100);

      expect(worst).toHaveLength(5);
    });

    it("works with different metric names", () => {
      const worst = findWorstSamples(results, "accuracy", 2);

      expect(worst).toHaveLength(2);
      expect(worst[0].sampleId).toBe("sample-002");
      expect(worst[0].metricValue).toBe(0.5);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Per-field error breakdown
  // -----------------------------------------------------------------------
  describe("computePerFieldErrors", () => {
    it("produces per-field error breakdown for schema-aware evaluator", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.8 },
          diagnostics: {
            comparisonResults: [
              {
                field: "invoiceNumber",
                matched: true,
                predicted: "INV-001",
                expected: "INV-001",
              },
              {
                field: "totalAmount",
                matched: false,
                predicted: "100",
                expected: "100.00",
              },
              {
                field: "date",
                matched: true,
                predicted: "2024-01-01",
                expected: "2024-01-01",
              },
            ],
          },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.6 },
          diagnostics: {
            comparisonResults: [
              {
                field: "invoiceNumber",
                matched: false,
                predicted: undefined,
                expected: "INV-002",
              },
              {
                field: "totalAmount",
                matched: false,
                predicted: "200",
                expected: "250.00",
              },
              {
                field: "date",
                matched: true,
                predicted: "2024-01-02",
                expected: "2024-01-02",
              },
            ],
          },
          pass: false,
        },
      ];

      const perFieldErrors = computePerFieldErrors(results);

      expect(perFieldErrors).toHaveLength(3);

      // Find totalAmount field (highest error rate)
      const totalAmountField = perFieldErrors.find(
        (f) => f.field === "totalAmount",
      );
      expect(totalAmountField).toBeDefined();
      expect(totalAmountField!.totalOccurrences).toBe(2);
      expect(totalAmountField!.matchCount).toBe(0);
      expect(totalAmountField!.mismatchCount).toBe(2);
      expect(totalAmountField!.errorRate).toBe(1.0);

      // Find invoiceNumber field
      const invoiceNumberField = perFieldErrors.find(
        (f) => f.field === "invoiceNumber",
      );
      expect(invoiceNumberField).toBeDefined();
      expect(invoiceNumberField!.totalOccurrences).toBe(2);
      expect(invoiceNumberField!.matchCount).toBe(1);
      expect(invoiceNumberField!.missingCount).toBe(1);
      expect(invoiceNumberField!.errorRate).toBe(0.5);

      // Find date field (no errors)
      const dateField = perFieldErrors.find((f) => f.field === "date");
      expect(dateField).toBeDefined();
      expect(dateField!.totalOccurrences).toBe(2);
      expect(dateField!.matchCount).toBe(2);
      expect(dateField!.errorRate).toBe(0);
    });

    it("sorts fields by error rate descending", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.5 },
          diagnostics: {
            comparisonResults: [
              { field: "a", matched: true, predicted: "1", expected: "1" },
              { field: "b", matched: false, predicted: "2", expected: "3" },
              { field: "c", matched: false, predicted: "4", expected: "5" },
            ],
          },
          pass: false,
        },
      ];

      const perFieldErrors = computePerFieldErrors(results);

      // Fields b and c should come before field a
      expect(perFieldErrors[0].errorRate).toBeGreaterThan(
        perFieldErrors[2].errorRate,
      );
    });

    it("excludes null-like values from error counts", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 1.0 },
          diagnostics: {
            comparisonResults: [
              // Both null-like: matched, should not count as error
              { field: "spouse_date", matched: true, predicted: null, expected: null },
              // Real value matched
              { field: "name", matched: true, predicted: "John", expected: "John" },
            ],
          },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.5 },
          diagnostics: {
            comparisonResults: [
              // Null expected with null predicted: matched, not an error
              { field: "spouse_date", matched: true, predicted: undefined, expected: null },
              // Real field mismatched
              { field: "name", matched: false, predicted: "Jane", expected: "Jon" },
            ],
          },
          pass: false,
        },
      ];

      const perFieldErrors = computePerFieldErrors(results);

      // spouse_date: both samples have null-like expected, so totalOccurrences = 0
      const spouseField = perFieldErrors.find((f) => f.field === "spouse_date");
      expect(spouseField).toBeUndefined(); // no real occurrences → not in output

      // name: 2 occurrences, 1 matched, 1 mismatched
      const nameField = perFieldErrors.find((f) => f.field === "name");
      expect(nameField).toBeDefined();
      expect(nameField!.totalOccurrences).toBe(2);
      expect(nameField!.matchCount).toBe(1);
      expect(nameField!.mismatchCount).toBe(1);
      expect(nameField!.errorRate).toBe(0.5);
    });

    it("returns empty array for non-schema-aware results", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { exact_match: 0 },
          diagnostics: { diff: [] },
          pass: false,
        },
      ];

      const perFieldErrors = computePerFieldErrors(results);

      expect(perFieldErrors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Aggregated metrics stored in BenchmarkRun
  // -----------------------------------------------------------------------
  describe("aggregateResults", () => {
    it("returns overall aggregated metrics", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.9 },
          diagnostics: {},
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.8 },
          diagnostics: {},
          pass: true,
        },
      ];

      const aggregation = aggregateResults(results);

      expect(aggregation.overall).toBeDefined();
      expect(aggregation.overall.totalSamples).toBe(2);
      expect(aggregation.overall.passingSamples).toBe(2);
      expect(aggregation.overall.metrics.f1).toBeDefined();
    });

    it("includes sliced metrics when dimensions are specified", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.9 },
          diagnostics: { metadata: { docType: "invoice" } },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.8 },
          diagnostics: { metadata: { docType: "receipt" } },
          pass: true,
        },
      ];

      const aggregation = aggregateResults(results, {
        sliceDimensions: ["docType"],
      });

      expect(aggregation.sliced).toBeDefined();
      expect(aggregation.sliced).toHaveLength(1);
      expect(aggregation.sliced![0].dimension).toBe("docType");
      expect(aggregation.sliced![0].slices.invoice).toBeDefined();
      expect(aggregation.sliced![0].slices.receipt).toBeDefined();
    });

    it("includes failure analysis when requested", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.5 },
          diagnostics: {},
          pass: false,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.9 },
          diagnostics: {},
          pass: true,
        },
      ];

      const aggregation = aggregateResults(results, {
        failureAnalysis: {
          topN: 1,
          metricName: "f1",
        },
      });

      expect(aggregation.failureAnalysis).toBeDefined();
      expect(aggregation.failureAnalysis!.worstSamples).toHaveLength(1);
      expect(aggregation.failureAnalysis!.worstSamples[0].sampleId).toBe(
        "sample-001",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Slicing by metadata dimensions
  // -----------------------------------------------------------------------
  describe("computeSlicedMetrics", () => {
    it("computes metrics per unique value of each metadata dimension", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.9 },
          diagnostics: { metadata: { docType: "invoice", language: "en" } },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.85 },
          diagnostics: { metadata: { docType: "invoice", language: "fr" } },
          pass: true,
        },
        {
          sampleId: "sample-003",
          metrics: { f1: 0.7 },
          diagnostics: { metadata: { docType: "receipt", language: "en" } },
          pass: false,
        },
      ];

      const sliced = computeSlicedMetrics(results, ["docType", "language"]);

      expect(sliced).toHaveLength(2);

      // Check docType dimension
      const docTypeSlice = sliced.find((s) => s.dimension === "docType");
      expect(docTypeSlice).toBeDefined();
      expect(docTypeSlice!.slices.invoice).toBeDefined();
      expect(docTypeSlice!.slices.invoice.totalSamples).toBe(2);
      expect(docTypeSlice!.slices.receipt).toBeDefined();
      expect(docTypeSlice!.slices.receipt.totalSamples).toBe(1);

      // Check language dimension
      const languageSlice = sliced.find((s) => s.dimension === "language");
      expect(languageSlice).toBeDefined();
      expect(languageSlice!.slices.en).toBeDefined();
      expect(languageSlice!.slices.en.totalSamples).toBe(2);
      expect(languageSlice!.slices.fr).toBeDefined();
      expect(languageSlice!.slices.fr.totalSamples).toBe(1);
    });

    it("uses 'unknown' for missing metadata values", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.9 },
          diagnostics: { metadata: { docType: "invoice" } },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.8 },
          diagnostics: {},
          pass: true,
        },
      ];

      const sliced = computeSlicedMetrics(results, ["language"]);

      expect(sliced).toHaveLength(1);
      expect(sliced[0].slices.unknown).toBeDefined();
      expect(sliced[0].slices.unknown.totalSamples).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Handle empty results gracefully
  // -----------------------------------------------------------------------
  describe("empty results handling", () => {
    it("handles empty results array gracefully", () => {
      const results: EvaluationResult[] = [];

      const aggregated = computeAggregatedMetrics(results);

      expect(aggregated.totalSamples).toBe(0);
      expect(aggregated.passingSamples).toBe(0);
      expect(aggregated.failingSamples).toBe(0);
      expect(aggregated.passRate).toBe(0);
      expect(aggregated.metrics).toEqual({});
    });

    it("handles all samples failing to produce output", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: {},
          diagnostics: { error: "Failed to load file" },
          pass: false,
        },
        {
          sampleId: "sample-002",
          metrics: {},
          diagnostics: { error: "Failed to load file" },
          pass: false,
        },
      ];

      const aggregated = computeAggregatedMetrics(results);

      expect(aggregated.totalSamples).toBe(2);
      expect(aggregated.passingSamples).toBe(0);
      expect(aggregated.failingSamples).toBe(2);
      expect(aggregated.passRate).toBe(0);

      const aggregation = aggregateResults(results, {
        failureAnalysis: { topN: 10, metricName: "f1" },
      });

      expect(aggregation.failureAnalysis).toBeDefined();
      expect(aggregation.failureAnalysis!.worstSamples).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Integration: Full failure analysis
  // -----------------------------------------------------------------------
  describe("performFailureAnalysis", () => {
    it("combines worst samples, per-field errors, and error clusters", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.9, precision: 0.95, recall: 0.85 },
          diagnostics: {
            comparisonResults: [
              {
                field: "field1",
                matched: true,
                predicted: "a",
                expected: "a",
              },
            ],
          },
          pass: true,
        },
        {
          sampleId: "sample-002",
          metrics: { f1: 0.5, precision: 0.6, recall: 0.45 },
          diagnostics: {
            missingFields: ["field2"],
            comparisonResults: [
              {
                field: "field1",
                matched: false,
                predicted: undefined,
                expected: "b",
              },
            ],
          },
          pass: false,
        },
        {
          sampleId: "sample-003",
          metrics: { f1: 0.4, precision: 0.5, recall: 0.35 },
          diagnostics: {
            mismatchedFields: [{ field: "field1" }],
            comparisonResults: [
              {
                field: "field1",
                matched: false,
                predicted: "c",
                expected: "d",
              },
            ],
          },
          pass: false,
        },
      ];

      const analysis = performFailureAnalysis(results, {
        topN: 2,
        metricName: "f1",
      });

      // Worst samples
      expect(analysis.worstSamples).toHaveLength(2);
      expect(analysis.worstSamples[0].sampleId).toBe("sample-003");
      expect(analysis.worstSamples[1].sampleId).toBe("sample-002");

      // Per-field errors
      expect(analysis.perFieldErrors).toBeDefined();
      expect(analysis.perFieldErrors!.length).toBeGreaterThan(0);
    });

    it("uses default options when not specified", () => {
      const results: EvaluationResult[] = [
        {
          sampleId: "sample-001",
          metrics: { f1: 0.5 },
          diagnostics: {},
          pass: false,
        },
      ];

      const analysis = performFailureAnalysis(results, {});

      expect(analysis.worstSamples).toBeDefined();
    });
  });
});
