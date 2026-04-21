/**
 * Black-Box Evaluator Tests
 *
 * Tests for the black-box evaluator implementation.
 * See feature-docs/003-benchmarking-system/user-stories/US-016-black-box-evaluator.md
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { EvaluationInput } from "../benchmark-types";
import { BlackBoxEvaluator } from "./black-box-evaluator";

describe("BlackBoxEvaluator", () => {
  let evaluator: BlackBoxEvaluator;
  let tempDir: string;

  beforeAll(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-eval-test-"));
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    evaluator = new BlackBoxEvaluator();
  });

  // Helper to create test files
  async function createJsonFiles(
    prediction: unknown,
    groundTruth: unknown,
  ): Promise<{ predictionPath: string; groundTruthPath: string }> {
    const predictionPath = path.join(tempDir, `pred-${Date.now()}.json`);
    const groundTruthPath = path.join(tempDir, `gt-${Date.now()}.json`);

    await fs.writeFile(predictionPath, JSON.stringify(prediction, null, 2));
    await fs.writeFile(groundTruthPath, JSON.stringify(groundTruth, null, 2));

    return { predictionPath, groundTruthPath };
  }

  async function createTextFiles(
    prediction: string,
    groundTruth: string,
  ): Promise<{ predictionPath: string; groundTruthPath: string }> {
    const predictionPath = path.join(tempDir, `pred-${Date.now()}.txt`);
    const groundTruthPath = path.join(tempDir, `gt-${Date.now()}.txt`);

    await fs.writeFile(predictionPath, prediction);
    await fs.writeFile(groundTruthPath, groundTruth);

    return { predictionPath, groundTruthPath };
  }

  // -----------------------------------------------------------------------
  // Scenario 1: JSON deep-equal comparison
  // -----------------------------------------------------------------------
  describe("JSON deep-equal comparison", () => {
    it("matches when JSON objects are identical", async () => {
      const data = {
        name: "John Doe",
        age: 30,
        address: {
          street: "123 Main St",
          city: "New York",
        },
      };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        data,
        data,
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
      expect(result.metrics.exact_match).toBe(1.0);
      expect(result.metrics.field_overlap).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.diagnostics.exactMatch).toBe(true);
    });

    it("detects mismatch when JSON objects differ", async () => {
      const prediction = { name: "John Doe", age: 30 };
      const groundTruth = { name: "Jane Doe", age: 30 };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
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

      expect(result.metrics.exact_match).toBe(0.0);
      expect(result.pass).toBe(false);
      expect(result.diagnostics.exactMatch).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Diff output for mismatches
  // -----------------------------------------------------------------------
  describe("diff output", () => {
    it("generates diff for changed fields", async () => {
      const prediction = { name: "John Doe", age: 30, city: "NYC" };
      const groundTruth = { name: "Jane Doe", age: 30, city: "NYC" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-003",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.diagnostics.diff).toBeDefined();
      const diff = result.diagnostics.diff as any[];
      expect(diff.length).toBe(1);
      expect(diff[0].path).toBe("name");
      expect(diff[0].type).toBe("changed");
      expect(diff[0].expected).toBe("Jane Doe");
      expect(diff[0].actual).toBe("John Doe");
    });

    it("generates diff for missing fields", async () => {
      const prediction = { name: "John Doe" };
      const groundTruth = { name: "John Doe", age: 30 };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-004",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      const diff = result.diagnostics.diff as any[];
      expect(diff.length).toBe(1);
      expect(diff[0].path).toBe("age");
      expect(diff[0].type).toBe("deleted");
      expect(diff[0].expected).toBe(30);
    });

    it("generates diff for extra fields", async () => {
      const prediction = { name: "John Doe", extra: "field" };
      const groundTruth = { name: "John Doe" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-005",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      const diff = result.diagnostics.diff as any[];
      expect(diff.length).toBe(1);
      expect(diff[0].path).toBe("extra");
      expect(diff[0].type).toBe("added");
      expect(diff[0].actual).toBe("field");
    });

    it("generates diff for nested objects", async () => {
      const prediction = {
        user: { name: "John", age: 30 },
      };
      const groundTruth = {
        user: { name: "Jane", age: 30 },
      };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-006",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      const diff = result.diagnostics.diff as any[];
      expect(diff.length).toBe(1);
      expect(diff[0].path).toBe("user.name");
      expect(diff[0].type).toBe("changed");
    });

    it("generates diff for arrays", async () => {
      const prediction = { items: [1, 2, 3] };
      const groundTruth = { items: [1, 2, 4] };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-007",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      const diff = result.diagnostics.diff as any[];
      expect(diff.length).toBe(1);
      expect(diff[0].path).toBe("items[2]");
      expect(diff[0].type).toBe("changed");
      expect(diff[0].expected).toBe(4);
      expect(diff[0].actual).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Diff artifact is generated
  // -----------------------------------------------------------------------
  describe("diff artifact", () => {
    it("creates diff artifact when files differ", async () => {
      const prediction = { name: "John" };
      const groundTruth = { name: "Jane" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-008",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.artifacts).toBeDefined();
      expect(result.artifacts?.length).toBe(1);
      expect(result.artifacts?.[0].type).toBe("diff");
      expect(result.artifacts?.[0].mimeType).toBe("application/json");

      // Verify diff file exists and is valid JSON
      const diffPath = result.artifacts?.[0].path;
      expect(diffPath).toBeDefined();
      const diffContent = await fs.readFile(diffPath!, "utf-8");
      const diffData = JSON.parse(diffContent);
      expect(diffData.sampleId).toBe("sample-008");
      expect(diffData.differences).toBeDefined();
    });

    it("does not create artifact when files match", async () => {
      const data = { name: "John" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        data,
        data,
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

      expect(result.artifacts).toBeDefined();
      expect(result.artifacts?.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Emit match metric
  // -----------------------------------------------------------------------
  describe("exact_match metric", () => {
    it("emits 1.0 for exact match", async () => {
      const data = { key: "value" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        data,
        data,
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

      expect(result.metrics.exact_match).toBe(1.0);
    });

    it("emits 0.0 for mismatch", async () => {
      const prediction = { key: "value1" };
      const groundTruth = { key: "value2" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-011",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.exact_match).toBe(0.0);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Emit similarity metric
  // -----------------------------------------------------------------------
  describe("field_overlap metric", () => {
    it("calculates field overlap for objects", async () => {
      const prediction = {
        field1: "value1", // Match
        field2: "wrong", // Mismatch
        field3: "value3", // Match
      };
      const groundTruth = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-012",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      // 2 out of 3 fields match
      expect(result.metrics.field_overlap).toBeCloseTo(2 / 3, 3);
    });

    it("calculates field overlap with missing fields", async () => {
      const prediction = { field1: "value1" };
      const groundTruth = { field1: "value1", field2: "value2" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-013",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      // 1 out of 2 total fields match
      expect(result.metrics.field_overlap).toBe(0.5);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Pass/fail based on exact match
  // -----------------------------------------------------------------------
  describe("pass/fail determination", () => {
    it("passes when outputs match exactly", async () => {
      const data = { key: "value" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        data,
        data,
      );

      const input: EvaluationInput = {
        sampleId: "sample-014",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.pass).toBe(true);
    });

    it("fails when outputs differ", async () => {
      const prediction = { key: "value1" };
      const groundTruth = { key: "value2" };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-015",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.pass).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Handle non-JSON output formats gracefully
  // -----------------------------------------------------------------------
  describe("non-JSON files", () => {
    it("handles text files with byte-level comparison", async () => {
      const text = "Hello, world!";

      const { predictionPath, groundTruthPath } = await createTextFiles(
        text,
        text,
      );

      const input: EvaluationInput = {
        sampleId: "sample-016",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.exact_match).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.diagnostics.format).toBe("raw");
    });

    it("detects mismatch in text files", async () => {
      const prediction = "Hello, world!";
      const groundTruth = "Hello, universe!";

      const { predictionPath, groundTruthPath } = await createTextFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-017",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.exact_match).toBe(0.0);
      expect(result.pass).toBe(false);
      expect(result.diagnostics.format).toBe("raw");
      expect(result.diagnostics.lengthDifference).toBe(-3); // "world" vs "universe"
    });

    it("does not crash on malformed JSON", async () => {
      const prediction = "{ invalid json }";
      const groundTruth = "{ also invalid }";

      const { predictionPath, groundTruthPath } = await createTextFiles(
        prediction,
        groundTruth,
      );

      const input: EvaluationInput = {
        sampleId: "sample-018",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result).toBeDefined();
      expect(result.metrics.exact_match).toBe(0.0);
      expect(result.diagnostics.format).toBe("raw");
    });
  });

  // -----------------------------------------------------------------------
  // Integration tests
  // -----------------------------------------------------------------------
  describe("integration", () => {
    it("evaluates complex nested structures", async () => {
      const data = {
        user: {
          name: "John Doe",
          contacts: [
            { type: "email", value: "john@example.com" },
            { type: "phone", value: "555-1234" },
          ],
        },
        settings: {
          notifications: true,
          theme: "dark",
        },
      };

      const { predictionPath, groundTruthPath } = await createJsonFiles(
        data,
        data,
      );

      const input: EvaluationInput = {
        sampleId: "sample-019",
        inputPaths: [],
        predictionPaths: [predictionPath],
        groundTruthPaths: [groundTruthPath],
        metadata: {},
        evaluatorConfig: {},
      };

      const result = await evaluator.evaluate(input);

      expect(result.metrics.exact_match).toBe(1.0);
      expect(result.metrics.field_overlap).toBe(1.0);
      expect(result.pass).toBe(true);
    });
  });
});
