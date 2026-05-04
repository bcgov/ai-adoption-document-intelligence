const mockExecuteChild = jest.fn();
const mockWritePrediction = jest.fn();
const mockPersistOcrCache = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  executeChild: mockExecuteChild,
  proxyActivities: () => ({
    "benchmark.writePrediction": mockWritePrediction,
    "benchmark.persistOcrCache": mockPersistOcrCache,
  }),
}));

import {
  type BenchmarkSampleWorkflowInput,
  benchmarkSampleWorkflow,
} from "./benchmark-sample-workflow";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

beforeEach(() => {
  mockExecuteChild.mockReset();
  mockWritePrediction.mockReset();
  mockPersistOcrCache.mockReset();
});

const baseConfig: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "test", version: "1.0" },
  nodes: {
    n1: { id: "n1", type: "activity", label: "n1", activityType: "test.a" },
  },
  edges: [],
  entryNodeId: "n1",
  ctx: {},
};

const baseInput: BenchmarkSampleWorkflowInput = {
  sampleId: "sample-001",
  workflowConfig: baseConfig,
  configHash: "abc",
  inputPaths: ["/tmp/in/doc.pdf"],
  outputBaseDir: "/tmp/out",
  sampleMetadata: {},
  predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
};

describe("benchmarkSampleWorkflow", () => {
  it("runs graphWorkflow, writes prediction, returns slim result without ctx", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1", "n2"],
      ctx: {
        cleanedResult: {
          documents: [{ fields: { name: { content: "Alex" } } }],
        },
        ocrResponse: { huge: "payload" },
        outputPaths: ["/tmp/out/doc.json"],
      },
    });
    mockWritePrediction.mockResolvedValue({
      predictionPath:
        "/tmp/out/.benchmark-outputs/sample-001/sample-001-prediction.json",
    });

    const result = await benchmarkSampleWorkflow(baseInput);

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "graphWorkflow",
      expect.objectContaining({
        args: [
          expect.objectContaining({
            graph: baseConfig,
            configHash: "abc",
          }),
        ],
      }),
    );
    expect(mockWritePrediction).toHaveBeenCalledWith({
      predictionData: { name: "Alex" },
      outputDir: "/tmp/out/.benchmark-outputs/sample-001",
      sampleId: "sample-001",
    });
    expect(result).toEqual({
      sampleId: "sample-001",
      success: true,
      graphStatus: "completed",
      completedNodes: 2,
      predictionPath:
        "/tmp/out/.benchmark-outputs/sample-001/sample-001-prediction.json",
      confidenceData: { name: null },
      outputPaths: ["/tmp/out/doc.json"],
    });
    expect(result).not.toHaveProperty("workflowResult");
    expect(JSON.stringify(result)).not.toContain("huge");
  });

  it("does not call persistOcrCache when persistOcrCache is undefined", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: { ocrResponse: { foo: "bar" } },
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow(baseInput);

    expect(mockPersistOcrCache).not.toHaveBeenCalled();
  });

  it("calls persistOcrCache when persistOcrCache.sourceRunId is provided and ocrResponse exists", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: { ocrResponse: { foo: "bar" } },
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow({
      ...baseInput,
      persistOcrCache: { sourceRunId: "run-42" },
    });

    expect(mockPersistOcrCache).toHaveBeenCalledWith({
      sourceRunId: "run-42",
      sampleId: "sample-001",
      ocrResponse: { foo: "bar" },
    });
  });

  it("does not call persistOcrCache when ocrResponse is null/undefined", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: {},
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow({
      ...baseInput,
      persistOcrCache: { sourceRunId: "run-42" },
    });

    expect(mockPersistOcrCache).not.toHaveBeenCalled();
  });

  it("infers PDF contentType from extension and forwards initialCtx to graphWorkflow", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: {},
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow({
      ...baseInput,
      sampleMetadata: { docType: "invoice" },
    });

    const childArgs = mockExecuteChild.mock.calls[0][1].args[0];
    expect(childArgs.initialCtx).toMatchObject({
      docType: "invoice",
      sampleId: "sample-001",
      documentId: "benchmark-sample-001",
      fileName: "doc.pdf",
      fileType: "pdf",
      contentType: "application/pdf",
      blobKey: "/tmp/in/doc.pdf",
    });
  });

  it("infers image contentType from extension", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: {},
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow({
      ...baseInput,
      inputPaths: ["/tmp/in/scan.png"],
    });

    const childArgs = mockExecuteChild.mock.calls[0][1].args[0];
    expect(childArgs.initialCtx).toMatchObject({
      fileName: "scan.png",
      fileType: "image",
      contentType: "image/png",
    });
  });

  it("extracts outputPaths from results[].outputPath in ctx", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: {
        results: [
          { outputPath: "/data/output/file1.json" },
          { outputPath: "/data/output/file2.json" },
        ],
      },
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    const result = await benchmarkSampleWorkflow(baseInput);

    expect(result.outputPaths).toEqual([
      "/data/output/file1.json",
      "/data/output/file2.json",
    ]);
  });

  it("falls back to outputBaseDir when ctx has no explicit output paths", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: { outputBaseDir: "/data/output/run-1/sample-001" },
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    const result = await benchmarkSampleWorkflow(baseInput);

    expect(result.outputPaths).toEqual(["/data/output/run-1/sample-001"]);
  });

  it("returns success=false with graphStatus when inner graphWorkflow returns status=failed", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "failed",
      completedNodes: ["n1"],
      ctx: { failedNodeId: "n2" },
    });
    mockWritePrediction.mockResolvedValue({ predictionPath: "/p" });

    const result = await benchmarkSampleWorkflow(baseInput);

    expect(result.success).toBe(false);
    expect(result.graphStatus).toBe("failed");
    expect(result.error).toEqual({
      message: "graphWorkflow status: failed",
      failedNodeId: "n2",
    });
  });
});
