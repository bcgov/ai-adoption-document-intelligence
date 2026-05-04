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
});
