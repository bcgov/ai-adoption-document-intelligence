// Mock @temporalio/workflow before importing the module
const mockExecuteChild = jest.fn();
const mockWorkflowInfo = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  executeChild: mockExecuteChild,
  workflowInfo: mockWorkflowInfo,
}));

import {
  type BenchmarkExecuteInput,
  benchmarkExecuteWorkflow,
} from "./benchmark-execute";

describe("benchmarkExecuteWorkflow", () => {
  const baseInput: BenchmarkExecuteInput = {
    sampleId: "sample-001",
    workflowVersionId: "wv-test-001",
    configHash: "abc123hash",
    inputPaths: ["/data/input/sample-001.pdf"],
    outputBaseDir: "/data/output/run-1/sample-001",
    sampleMetadata: { docType: "invoice", language: "en" },
    predictionOutputDir: "/data/output/run-1/.benchmark-outputs/sample-001",
    timeoutMs: 300000,
  };

  const mockChildResult = {
    sampleId: "sample-001",
    success: true,
    graphStatus: "completed" as const,
    completedNodes: 3,
    predictionPath:
      "/data/output/run-1/.benchmark-outputs/sample-001/sample-001-prediction.json",
    confidenceData: { name: 0.99 } as Record<string, number | null>,
    outputPaths: ["/data/output/run-1/sample-001/result.json"],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkflowInfo.mockReturnValue({
      workflowId: "benchmark-run-123",
    });
  });

  it("dispatches benchmarkSampleWorkflow on the configured task queue", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow(baseInput);

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        taskQueue: "benchmark-processing",
        workflowId: "benchmark-benchmark-run-123-sample-001",
        workflowExecutionTimeout: 300000,
      }),
    );
  });

  it("forwards persistOcrCache.sourceRunId to the wrapper", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow({
      ...baseInput,
      persistOcrCache: { sourceRunId: "run-99" },
    });

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            persistOcrCache: { sourceRunId: "run-99" },
          }),
        ],
      }),
    );
  });

  it("forwards predictionOutputDir, sampleMetadata and parentWorkflowId to the wrapper", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow(baseInput);

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            sampleId: "sample-001",
            workflowVersionId: "wv-test-001",
            configHash: "abc123hash",
            inputPaths: ["/data/input/sample-001.pdf"],
            outputBaseDir: "/data/output/run-1/sample-001",
            sampleMetadata: { docType: "invoice", language: "en" },
            predictionOutputDir:
              "/data/output/run-1/.benchmark-outputs/sample-001",
            parentWorkflowId: "benchmark-run-123",
          }),
        ],
      }),
    );
  });

  it("forwards workflowConfigOverrides to the wrapper", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow({
      ...baseInput,
      workflowConfigOverrides: { "ctx.modelId.defaultValue": "prebuilt-read" },
    });

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            workflowConfigOverrides: {
              "ctx.modelId.defaultValue": "prebuilt-read",
            },
          }),
        ],
      }),
    );
  });

  it("returns the slim child output without workflowResult", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    const result = await benchmarkExecuteWorkflow(baseInput);

    expect(result).toEqual(
      expect.objectContaining({
        sampleId: "sample-001",
        success: true,
        predictionPath: mockChildResult.predictionPath,
        confidenceData: mockChildResult.confidenceData,
        outputPaths: mockChildResult.outputPaths,
      }),
    );
    expect(result).not.toHaveProperty("workflowResult");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates failure with error message when wrapper returns success=false", async () => {
    mockExecuteChild.mockResolvedValue({
      ...mockChildResult,
      success: false,
      graphStatus: "failed" as const,
      error: { message: "graphWorkflow status: failed", failedNodeId: "n2" },
    });

    const result = await benchmarkExecuteWorkflow(baseInput);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("graphWorkflow status: failed");
    expect(result.error?.failedNodeId).toBe("n2");
  });

  it("converts thrown ChildWorkflowFailure into a failure result without crashing", async () => {
    mockExecuteChild.mockRejectedValue(
      Object.assign(new Error("Child Workflow execution failed"), {
        name: "ChildWorkflowFailure",
        cause: { name: "TimeoutFailure", message: "Timed out" },
      }),
    );

    const result = await benchmarkExecuteWorkflow(baseInput);

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/Child Workflow execution failed/);
    expect(result.outputPaths).toEqual([]);
  });

  it("uses default timeout when not specified", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    const inputWithoutTimeout = { ...baseInput };
    delete (inputWithoutTimeout as Partial<BenchmarkExecuteInput>).timeoutMs;

    await benchmarkExecuteWorkflow(inputWithoutTimeout);

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        workflowExecutionTimeout: 600000, // 10 minutes default
      }),
    );
  });

  it("supports custom task queue names", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow({
      ...baseInput,
      taskQueue: "custom-benchmark-queue",
    });

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        taskQueue: "custom-benchmark-queue",
      }),
    );
  });

  describe("error type classification", () => {
    it("classifies timeout errors", async () => {
      mockExecuteChild.mockRejectedValue(
        new Error("Workflow execution timeout"),
      );

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.error?.type).toBe("TIMEOUT");
    });

    it("classifies cancellation errors", async () => {
      mockExecuteChild.mockRejectedValue(new Error("Workflow was cancelled"));

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.error?.type).toBe("CANCELLED");
    });

    it("classifies generic workflow errors", async () => {
      mockExecuteChild.mockRejectedValue(new Error("Some unexpected error"));

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.error?.type).toBe("WORKFLOW_EXECUTION_ERROR");
    });

    it("handles non-Error thrown values", async () => {
      mockExecuteChild.mockRejectedValue("string error");

      const result = await benchmarkExecuteWorkflow(baseInput);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Unknown error");
      expect(result.error?.type).toBe("UNKNOWN_ERROR");
    });
  });
});
