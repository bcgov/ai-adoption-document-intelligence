import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { EvaluationInput } from "../benchmark-types";
import { OcrCorrectionEvaluator } from "./ocr-correction-evaluator";

describe("OcrCorrectionEvaluator", () => {
  let evaluator: OcrCorrectionEvaluator;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-eval-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    evaluator = new OcrCorrectionEvaluator();
  });

  async function writeJson(
    filename: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const filePath = path.join(tmpDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data));
    return filePath;
  }

  it("has type ocr-correction", () => {
    expect(evaluator.type).toBe("ocr-correction");
  });

  it("returns perfect metrics for identical prediction and ground truth", async () => {
    const predPath = await writeJson("pred-1.json", {
      Name: "John Doe",
      Date: "2024-01-15",
      Amount: "100.50",
    });
    const gtPath = await writeJson("gt-1.json", {
      Name: "John Doe",
      Date: "2024-01-15",
      Amount: "100.50",
    });

    const input: EvaluationInput = {
      sampleId: "sample-1",
      inputPaths: [],
      predictionPaths: [predPath],
      groundTruthPaths: [gtPath],
      metadata: {},
      evaluatorConfig: {},
    };

    const result = await evaluator.evaluate(input);

    expect(result.pass).toBe(true);
    expect(result.metrics.charAccuracy).toBe(1.0);
    expect(result.metrics.fieldAccuracy).toBe(1.0);
    expect(result.metrics.exactMatches).toBe(3);
  });

  it("computes character accuracy for partial matches", async () => {
    const predPath = await writeJson("pred-2.json", {
      Name: "Jonh Doe",
      Amount: "1O0.50",
    });
    const gtPath = await writeJson("gt-2.json", {
      Name: "John Doe",
      Amount: "100.50",
    });

    const input: EvaluationInput = {
      sampleId: "sample-2",
      inputPaths: [],
      predictionPaths: [predPath],
      groundTruthPaths: [gtPath],
      metadata: {},
      evaluatorConfig: {},
    };

    const result = await evaluator.evaluate(input);

    expect(result.metrics.charAccuracy).toBeGreaterThan(0.7);
    expect(result.metrics.charAccuracy).toBeLessThan(1.0);
    expect(result.metrics.fieldAccuracy).toBe(0);
  });

  it("respects fieldScope filter", async () => {
    const predPath = await writeJson("pred-3.json", {
      Name: "Wrong",
      Date: "2024-01-15",
    });
    const gtPath = await writeJson("gt-3.json", {
      Name: "Right",
      Date: "2024-01-15",
    });

    const input: EvaluationInput = {
      sampleId: "sample-3",
      inputPaths: [],
      predictionPaths: [predPath],
      groundTruthPaths: [gtPath],
      metadata: {},
      evaluatorConfig: { fieldScope: ["Date"] },
    };

    const result = await evaluator.evaluate(input);

    expect(result.metrics.totalFields).toBe(1);
    expect(result.metrics.exactMatches).toBe(1);
    expect(result.pass).toBe(true);
  });

  it("fails when paths are missing", async () => {
    const input: EvaluationInput = {
      sampleId: "sample-4",
      inputPaths: [],
      predictionPaths: [],
      groundTruthPaths: [],
      metadata: {},
      evaluatorConfig: {},
    };

    const result = await evaluator.evaluate(input);

    expect(result.pass).toBe(false);
    expect(result.diagnostics.error).toBe("missing_paths");
  });

  it("respects custom thresholds", async () => {
    const predPath = await writeJson("pred-5.json", {
      Name: "Jonh Doe",
    });
    const gtPath = await writeJson("gt-5.json", {
      Name: "John Doe",
    });

    const input: EvaluationInput = {
      sampleId: "sample-5",
      inputPaths: [],
      predictionPaths: [predPath],
      groundTruthPaths: [gtPath],
      metadata: {},
      evaluatorConfig: {
        charAccuracyThreshold: 0.5,
        fieldAccuracyThreshold: 0.0,
      },
    };

    const result = await evaluator.evaluate(input);
    expect(result.pass).toBe(true);
  });
});
