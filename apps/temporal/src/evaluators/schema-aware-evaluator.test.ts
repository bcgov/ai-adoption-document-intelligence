/**
 * Schema-Aware Evaluator Tests
 *
 * Tests for the schema-aware evaluator implementation.
 * See feature-docs/003-benchmarking-system/user-stories/US-015-schema-aware-evaluator.md
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { EvaluationInput } from "../benchmark-types";
import { SchemaAwareEvaluator } from "./schema-aware-evaluator";

describe("SchemaAwareEvaluator", () => {
  let evaluator: SchemaAwareEvaluator;
  let tempDir: string;

  beforeAll(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-test-"));
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    evaluator = new SchemaAwareEvaluator();
  });

  // Helper to create test files
  async function createTestFiles(
    prediction: Record<string, unknown>,
    groundTruth: Record<string, unknown>,
  ): Promise<{ predictionPath: string; groundTruthPath: string }> {
    const predictionPath = path.join(tempDir, `pred-${Date.now()}.json`);
    const groundTruthPath = path.join(tempDir, `gt-${Date.now()}.json`);

    await fs.writeFile(predictionPath, JSON.stringify(prediction, null, 2));
    await fs.writeFile(groundTruthPath, JSON.stringify(groundTruth, null, 2));

    return { predictionPath, groundTruthPath };
  }

  // -----------------------------------------------------------------------
  // Scenario 1: Compare flat JSON key-value outputs
  // -----------------------------------------------------------------------
  describe("flat JSON comparison", () => {
    it("compares flat JSON key-value pairs", async () => {
      const groundTruth = {
        name: "John Doe",
        age: "30",
        city: "New York",
      };

      const prediction = {
        name: "John Doe",
        age: "30",
        city: "New York",
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-001",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.sampleId).toBe("sample-001");
      expect(result.metrics.f1).toBe(1.0);
      expect(result.metrics.precision).toBe(1.0);
      expect(result.metrics.recall).toBe(1.0);
      expect(result.pass).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Compute per-field precision, recall, and F1
  // -----------------------------------------------------------------------
  describe("precision, recall, F1 metrics", () => {
    it("calculates metrics correctly with partial matches", async () => {
      const groundTruth = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
      };

      const prediction = {
        field1: "value1", // Match
        field2: "wrong", // Mismatch
        field3: "value3", // Match
        // field4 missing
        field5: "extra", // Extra field
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-002",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      // True positives: field1, field3 (2)
      // False positives: field5 (1)
      // False negatives: field2, field4 (2)
      // Precision = 2 / (2 + 1) = 0.6667
      // Recall = 2 / (2 + 2) = 0.5
      // F1 = 2 * 0.6667 * 0.5 / (0.6667 + 0.5) = 0.5714

      expect(result.metrics.truePositives).toBe(2);
      expect(result.metrics.falsePositives).toBe(1);
      expect(result.metrics.falseNegatives).toBe(2);
      expect(result.metrics.precision).toBeCloseTo(0.6667, 3);
      expect(result.metrics.recall).toBeCloseTo(0.5, 3);
      expect(result.metrics.f1).toBeCloseTo(0.5714, 3);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Exact match comparison
  // -----------------------------------------------------------------------
  describe("exact match", () => {
    it("matches only when values are exactly equal", async () => {
      const groundTruth = {
        field1: "value1",
        field2: "Value2", // Different case
      };

      const prediction = {
        field1: "value1", // Exact match
        field2: "value2", // Case mismatch
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-003",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          defaultRule: { rule: "exact" },
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(1); // Only field1
      expect(result.diagnostics.mismatchedFields).toHaveLength(1);
      expect((result.diagnostics.mismatchedFields as any[])[0].field).toBe(
        "field2",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Fuzzy match comparison
  // -----------------------------------------------------------------------
  describe("fuzzy match", () => {
    it("matches when similarity exceeds threshold", async () => {
      const groundTruth = {
        field1: "John Doe",
        field2: "New York City",
      };

      const prediction = {
        field1: "John D0e", // Typo: 0 instead of o
        field2: "New York", // Missing "City"
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-004",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          fieldRules: {
            field1: { rule: "fuzzy", fuzzyThreshold: 0.8 },
            field2: { rule: "fuzzy", fuzzyThreshold: 0.8 },
          },
        },
      };

      const result = await evaluator.evaluate(input);

      // field1: "John D0e" vs "John Doe" - high similarity (1 char difference)
      // field2: "New York" vs "New York City" - lower similarity
      expect(result.diagnostics.comparisonResults).toBeDefined();

      const field1Result = (result.diagnostics.comparisonResults as any[]).find(
        (r: { field: string }) => r.field === "field1",
      );
      const field2Result = (result.diagnostics.comparisonResults as any[]).find(
        (r: { field: string }) => r.field === "field2",
      );

      expect(field1Result.matched).toBe(true);
      expect(field1Result.similarity).toBeGreaterThan(0.8);

      expect(field2Result.matched).toBe(false); // "New York" vs "New York City"
      expect(field2Result.similarity).toBeLessThan(0.8);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Numeric tolerance comparison
  // -----------------------------------------------------------------------
  describe("numeric match", () => {
    it("matches within absolute tolerance", async () => {
      const groundTruth = {
        amount1: "100.00",
        amount2: "1,500.50",
      };

      const prediction = {
        amount1: "100.05", // Within 0.1 tolerance
        amount2: "1500.50", // Same value, different format
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-005",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          fieldRules: {
            amount1: { rule: "numeric", numericAbsoluteTolerance: 0.1 },
            amount2: { rule: "numeric", numericAbsoluteTolerance: 0.01 },
          },
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(2);
      expect(result.metrics.f1).toBe(1.0);

      const amount1Result = (
        result.diagnostics.comparisonResults as any[]
      ).find((r: { field: string }) => r.field === "amount1");
      expect(amount1Result.absoluteError).toBeCloseTo(0.05, 2);
    });

    it("matches within relative tolerance", async () => {
      const groundTruth = {
        value: "1000",
      };

      const prediction = {
        value: "1050", // 5% difference
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-006",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          fieldRules: {
            value: { rule: "numeric", numericRelativeTolerance: 0.1 }, // 10% tolerance
          },
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(1);

      const valueResult = (result.diagnostics.comparisonResults as any[]).find(
        (r: { field: string }) => r.field === "value",
      );
      expect(valueResult.relativeError).toBeCloseTo(0.05, 2);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Date format normalization
  // -----------------------------------------------------------------------
  describe("date match", () => {
    it("matches dates with different formats", async () => {
      const groundTruth = {
        date1: "2023-01-15",
        date2: "2025-Jan-11",
      };

      const prediction = {
        date1: "2023-01-15", // Same format
        date2: "2025-01-11", // Different format, same date
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-007",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          fieldRules: {
            date1: { rule: "date" },
            date2: { rule: "date" },
          },
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(2);
      expect(result.metrics.f1).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Boolean/checkbox accuracy
  // -----------------------------------------------------------------------
  describe("boolean match", () => {
    it("computes checkbox accuracy", async () => {
      const groundTruth = {
        checkbox1: true,
        checkbox2: false,
        checkbox3: true,
        checkbox4: false,
      };

      const prediction = {
        checkbox1: true, // Correct
        checkbox2: false, // Correct
        checkbox3: false, // Wrong
        checkbox4: true, // Wrong
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-008",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          defaultRule: { rule: "boolean" },
        },
      };

      const result = await evaluator.evaluate(input);

      // 2 out of 4 correct
      expect(result.metrics.checkboxAccuracy).toBe(0.5);
      expect(result.metrics.matchedFields).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Missing fields in prediction
  // -----------------------------------------------------------------------
  describe("missing fields", () => {
    it("counts missing fields and reduces recall", async () => {
      const groundTruth = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      };

      const prediction = {
        field1: "value1",
        // field2 and field3 missing
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-009",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.diagnostics.missingFields).toEqual(["field2", "field3"]);
      expect(result.metrics.matchedFields).toBe(1);
      expect(result.metrics.recall).toBeCloseTo(1 / 3, 3);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 9: Extra fields in prediction
  // -----------------------------------------------------------------------
  describe("extra fields", () => {
    it("counts extra fields and reduces precision", async () => {
      const groundTruth = {
        field1: "value1",
      };

      const prediction = {
        field1: "value1",
        field2: "extra1",
        field3: "extra2",
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-010",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.diagnostics.extraFields).toEqual(["field2", "field3"]);
      expect(result.metrics.matchedFields).toBe(1);
      expect(result.metrics.precision).toBeCloseTo(1 / 3, 3);
    });

    it("ignores null-like extra fields in prediction", async () => {
      const groundTruth = {
        field1: "value1",
      };

      const prediction = {
        field1: "value1",
        field2: null,
        field3: "",
        field4: "null",
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-extra-null",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.diagnostics.extraFields).toEqual([]);
      expect(result.metrics.matchedFields).toBe(1);
      expect(result.metrics.precision).toBe(1.0);
      expect(result.metrics.f1).toBe(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 10: Pass/fail determination
  // -----------------------------------------------------------------------
  describe("pass/fail threshold", () => {
    it("passes when F1 meets threshold", async () => {
      const groundTruth = {
        field1: "value1",
        field2: "value2",
      };

      const prediction = {
        field1: "value1",
        field2: "value2",
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-011",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          passThreshold: 0.9,
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.f1).toBe(1.0);
      expect(result.pass).toBe(true);
    });

    it("fails when F1 is below threshold", async () => {
      const groundTruth = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      };

      const prediction = {
        field1: "value1",
        field2: "wrong",
        // field3 missing
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-012",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          passThreshold: 0.9,
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.f1).toBeLessThan(0.9);
      expect(result.pass).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 11: Null-like value equivalence
  // -----------------------------------------------------------------------
  describe("null-like value equivalence", () => {
    it("matches null expected against undefined predicted (missing field)", async () => {
      const groundTruth = {
        field1: "value1",
        field2: null,
      };

      const prediction = {
        field1: "value1",
        // field2 missing (undefined)
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-null-1",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(2);
      expect(result.metrics.f1).toBe(1.0);
    });

    it("matches empty string predicted against null expected", async () => {
      const groundTruth = {
        field1: null,
      };

      const prediction = {
        field1: "",
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-null-2",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(1);
      expect(result.metrics.f1).toBe(1.0);
    });

    it('matches "null" string against actual null', async () => {
      const groundTruth = {
        field1: "null",
      };

      const prediction = {
        field1: null,
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-null-3",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(1);
      expect(result.metrics.f1).toBe(1.0);
    });

    it("does not match null-like predicted against real expected value", async () => {
      const groundTruth = {
        field1: "real value",
      };

      const prediction = {
        field1: null,
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-null-4",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.matchedFields).toBe(0);
      expect(result.metrics.f1).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Integration test: Complex scenario
  // -----------------------------------------------------------------------
  describe("complex integration", () => {
    it("evaluates complex ground truth with mixed field types", async () => {
      const groundTruth = {
        name: "Edward Shaw",
        sin: "104125381",
        date: "2013-09-21",
        income1: "999.91",
        checkbox_need_assistance_no: true,
        checkbox_family_assets_no: true,
      };

      const prediction = {
        name: "Edward Shaw",
        sin: "104125381",
        date: "2013-09-21",
        income1: "1000.00", // Slightly off
        checkbox_need_assistance_no: true,
        checkbox_family_assets_no: false, // Wrong
      };

      const { predictionPath, groundTruthPath } = await createTestFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-013",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {
          fieldRules: {
            income1: { rule: "numeric", numericAbsoluteTolerance: 0.5 },
          },
          defaultRule: { rule: "exact" },
          passThreshold: 0.8,
        },
      };

      const result = await evaluator.evaluate(input);

      expect(result.sampleId).toBe("sample-013");
      expect(result.metrics.matchedFields).toBe(5); // All except checkbox_family_assets_no
      // Precision = 5 / (5 + 0) = 1.0 (no extra fields)
      expect(result.metrics.precision).toBeCloseTo(1.0, 3);
      // Recall = 5 / (5 + 1) = 0.8333 (one mismatched field)
      expect(result.metrics.recall).toBeCloseTo(5 / 6, 3);
      expect(result.pass).toBe(true); // F1 should be > 0.8
    });
  });
});
