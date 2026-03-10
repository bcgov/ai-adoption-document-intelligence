/**
 * Tests for Benchmark Baseline Comparison Activity
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-034-baseline-management.md
 */

import { benchmarkCompareAgainstBaseline } from "./benchmark-baseline-comparison";
import { getPrismaClient } from "./database-client";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe("benchmarkCompareAgainstBaseline", () => {
  let prismaMock: {
    benchmarkRun: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      benchmarkRun: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should throw when run is not found", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue(null);

    await expect(
      benchmarkCompareAgainstBaseline({ runId: "non-existent" }),
    ).rejects.toThrow('Run with ID "non-existent" not found');
  });

  it("should return null when no baseline exists", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-1",
      definitionId: "def-1",
      metrics: { f1: 0.9 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue(null);

    const result = await benchmarkCompareAgainstBaseline({ runId: "run-1" });

    expect(result).toBeNull();
    expect(prismaMock.benchmarkRun.update).not.toHaveBeenCalled();
  });

  it("should return null when comparing baseline against itself", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-1",
      definitionId: "def-1",
      metrics: { f1: 0.9 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "run-1",
      metrics: { f1: 0.9 },
      baselineThresholds: [],
    });

    const result = await benchmarkCompareAgainstBaseline({ runId: "run-1" });

    expect(result).toBeNull();
    expect(prismaMock.benchmarkRun.update).not.toHaveBeenCalled();
  });

  it("should only find completed baseline runs", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.8 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue(null);

    await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    expect(prismaMock.benchmarkRun.findFirst).toHaveBeenCalledWith({
      where: {
        definitionId: "def-1",
        isBaseline: true,
        status: "completed",
      },
    });
  });

  it("should compute metric comparisons and return passing result", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.95, precision: 0.92 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9, precision: 0.88 },
      baselineThresholds: [
        { metricName: "f1", type: "absolute", value: 0.85 },
        { metricName: "precision", type: "relative", value: 0.95 },
      ],
    });

    const result = await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    expect(result).not.toBeNull();
    expect(result!.baselineRunId).toBe("baseline-1");
    expect(result!.overallPassed).toBe(true);
    expect(result!.regressedMetrics).toHaveLength(0);
    expect(result!.metricComparisons).toHaveLength(2);

    const f1Comparison = result!.metricComparisons.find(
      (m) => m.metricName === "f1",
    );
    expect(f1Comparison!.currentValue).toBe(0.95);
    expect(f1Comparison!.baselineValue).toBe(0.9);
    expect(f1Comparison!.passed).toBe(true);
  });

  it("should detect regressed metrics with absolute threshold", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.7 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9 },
      baselineThresholds: [{ metricName: "f1", type: "absolute", value: 0.85 }],
    });

    const result = await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    expect(result!.overallPassed).toBe(false);
    expect(result!.regressedMetrics).toEqual(["f1"]);
    expect(result!.metricComparisons[0].passed).toBe(false);
  });

  it("should detect regressed metrics with relative threshold", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.8 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9 },
      baselineThresholds: [{ metricName: "f1", type: "relative", value: 0.95 }],
    });

    // 0.95 * 0.90 = 0.855, current 0.80 < 0.855 → regression
    const result = await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    expect(result!.overallPassed).toBe(false);
    expect(result!.regressedMetrics).toEqual(["f1"]);
  });

  it("should update the run with comparison and regression tag", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.7 },
      tags: { environment: "test" },
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9 },
      baselineThresholds: [{ metricName: "f1", type: "absolute", value: 0.85 }],
    });

    await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    expect(prismaMock.benchmarkRun.update).toHaveBeenCalledWith({
      where: { id: "run-2" },
      data: {
        baselineComparison: expect.objectContaining({
          baselineRunId: "baseline-1",
          overallPassed: false,
        }),
        tags: {
          environment: "test",
          regression: "true",
        },
      },
    });
  });

  it("should not add regression tag when all metrics pass", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.95 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9 },
      baselineThresholds: [{ metricName: "f1", type: "absolute", value: 0.85 }],
    });

    await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    const updateCall = prismaMock.benchmarkRun.update.mock.calls[0][0];
    expect(updateCall.data.tags).toEqual({});
  });

  it("should skip non-numeric metrics", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.95, label: "test-run" },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9, label: "baseline-run" },
      baselineThresholds: [],
    });

    const result = await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    expect(result!.metricComparisons).toHaveLength(1);
    expect(result!.metricComparisons[0].metricName).toBe("f1");
  });

  it("should handle missing baseline thresholds gracefully", async () => {
    prismaMock.benchmarkRun.findUnique.mockResolvedValue({
      id: "run-2",
      definitionId: "def-1",
      metrics: { f1: 0.7 },
      tags: {},
    });
    prismaMock.benchmarkRun.findFirst.mockResolvedValue({
      id: "baseline-1",
      metrics: { f1: 0.9 },
      baselineThresholds: null,
    });

    const result = await benchmarkCompareAgainstBaseline({ runId: "run-2" });

    // Without thresholds, all metrics pass by default
    expect(result!.overallPassed).toBe(true);
    expect(result!.metricComparisons[0].passed).toBe(true);
  });
});
