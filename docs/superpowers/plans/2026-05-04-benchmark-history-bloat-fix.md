# Benchmark History‑Bloat Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the parent benchmark orchestrator workflow from accumulating per‑sample OCR/prediction payloads in its Temporal history, so 100‑doc runs no longer hit the 50 MB server termination limit and child workflows no longer time out from worker‑thread starvation caused by parent‑history replay.

**Architecture:** Insert a thin wrapper child workflow (`benchmarkSampleWorkflow`) between the parent benchmark orchestrator and the existing generic `graphWorkflow`. The wrapper executes `graphWorkflow` as its own child, then calls `benchmark.persistOcrCache` and `benchmark.writePrediction` activities — both of which currently run in parent context with large payloads. The wrapper returns only a slim summary (`predictionPath`, `confidenceData`, success/error). The parent never sees the heavy `ctx.ocrResponse` / `ctx.cleanedResult` payloads, so its history stays small (≈5 MB at 100 samples instead of ≈50 MB).

**Tech Stack:** TypeScript, Temporal TypeScript SDK, Jest, NestJS (backend has no changes), Prisma. All changes are confined to `apps/temporal/src/`.

**Branch:** `fix/benchmark-history-bloat-via-wrapper-workflow` (already created from `develop`).

---

## File Structure

**New files:**
- `apps/temporal/src/benchmark-sample-workflow.ts` — wrapper child workflow type
- `apps/temporal/src/benchmark-sample-workflow.test.ts` — unit tests for the wrapper

**Modified files:**
- `apps/temporal/src/benchmark-workflows.ts` — register the new workflow type in the bundle
- `apps/temporal/src/activities/benchmark-execute.ts` — call new wrapper instead of `graphWorkflow` directly; return slim shape
- `apps/temporal/src/activities/benchmark-execute.test.ts` — update tests to assert new behaviour
- `apps/temporal/src/benchmark-workflow.ts` — consume the slim child result; drop the parent‑side `persistOcrCache` and `writePrediction` calls
- `apps/temporal/src/benchmark-workflow.test.ts` — update tests for new behaviour

**Documentation:**
- `docs-md/benchmarking/temporal-history-bloat-fix.md` — short note explaining the architecture change and why it was needed

---

## Background facts the implementer should know

- The parent workflow `benchmarkRunWorkflow` lives in [apps/temporal/src/benchmark-workflow.ts](../../../apps/temporal/src/benchmark-workflow.ts).
- It calls `benchmarkExecuteWorkflow` (a workflow‑level helper, not an activity) per sample at line 521. That helper does `executeChild("graphWorkflow", ...)` to run one sample.
- After the child returns, the parent reads `executeOutput.workflowResult.ctx.ocrResponse` (≈500 KB) to call the `benchmark.persistOcrCache` activity (parent‑side, line 528‑533), and reads `executeOutput.workflowResult.ctx.cleanedResult` / `ctx.ocrResult` (also large) to flatten predictions and call `benchmark.writePrediction` (line 582‑592).
- Both of those large fields end up in the parent's Temporal history twice: once as part of the `ChildWorkflowExecutionCompleted` event payload, and once as the activity input arguments. With ~600 KB per sample × ~85 samples this exceeds Temporal's default `historySizeLimitError` of 50 MB and the workflow is server‑terminated.
- Activities called from a workflow context have their input arguments stored in that workflow's history. So just moving `benchmark.persistOcrCache` from the parent into `benchmarkExecuteWorkflow` would *not* help — `benchmarkExecuteWorkflow` runs in the parent's context. The activity must be called from inside an actual child workflow, which is why we need a new wrapper workflow type.
- The new wrapper child workflow is dispatched on the same `benchmark-processing` task queue, so the same worker process handles it. Files written by activities inside the child are on the same disk as activities run from the parent, so the parent's `benchmark.evaluate` activity can still read prediction files written by the child.

---

## Task 1: Define the wrapper child workflow's I/O types and skeleton

**Files:**
- Create: `apps/temporal/src/benchmark-sample-workflow.ts`

- [ ] **Step 1: Create the file with the I/O types and a stub function**

```typescript
/**
 * Benchmark Sample Workflow (wrapper child)
 *
 * Runs the generic `graphWorkflow` as its own child and performs benchmark-specific
 * post-processing (writing the flattened prediction file and persisting OCR cache)
 * inside this workflow's context — so the heavy `ocrResponse` and `cleanedResult`
 * payloads stay in this child's history, not the parent benchmark orchestrator's.
 *
 * Returns only a slim summary so the parent's history does not grow with per-sample
 * data. See docs-md/benchmarking/temporal-history-bloat-fix.md for context.
 */

import { executeChild, proxyActivities } from "@temporalio/workflow";
import {
  buildFlatConfidenceMapFromCtx,
  buildFlatPredictionMapFromCtx,
} from "./azure-ocr-field-display-value";
import {
  GRAPH_RUNNER_VERSION,
  type GraphWorkflowConfig,
  type GraphWorkflowInput,
  type GraphWorkflowResult,
} from "./graph-workflow-types";

export interface BenchmarkSampleWorkflowInput {
  sampleId: string;
  workflowConfig: GraphWorkflowConfig;
  configHash: string;
  inputPaths: string[];
  outputBaseDir: string;
  /** Free-form metadata forwarded into the graphWorkflow initialCtx. */
  sampleMetadata: Record<string, unknown>;
  /** Directory under which prediction JSON files should be written. */
  predictionOutputDir: string;
  /**
   * If set, the wrapper persists the OCR response to BenchmarkOcrCache for this run.
   * The activity input is stored in *this* workflow's history, not the parent's.
   */
  persistOcrCache?: { sourceRunId: string };
  parentWorkflowId?: string;
  requestId?: string;
}

export interface BenchmarkSampleWorkflowOutput {
  sampleId: string;
  success: boolean;
  /** Status reported by the inner graphWorkflow (when it ran to completion). */
  graphStatus?: "completed" | "failed" | "cancelled";
  /** Number of graph nodes the inner workflow completed (for logging). */
  completedNodes?: number;
  /** Path to the per-sample prediction JSON written by benchmark.writePrediction. */
  predictionPath?: string;
  /** Per-field confidence map flattened from the inner workflow ctx. */
  confidenceData?: Record<string, number | null>;
  /** Output paths extracted from the inner workflow ctx. */
  outputPaths: string[];
  error?: { message: string; failedNodeId?: string };
}

interface BenchmarkActivities {
  "benchmark.writePrediction": (input: {
    predictionData: Record<string, unknown>;
    outputDir: string;
    sampleId: string;
  }) => Promise<{ predictionPath: string }>;
  "benchmark.persistOcrCache": (input: {
    sourceRunId: string;
    sampleId: string;
    ocrResponse: unknown;
  }) => Promise<void>;
}

const customActivities = proxyActivities<BenchmarkActivities>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 3 },
});

export async function benchmarkSampleWorkflow(
  _input: BenchmarkSampleWorkflowInput,
): Promise<BenchmarkSampleWorkflowOutput> {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Commit the skeleton**

```bash
git add apps/temporal/src/benchmark-sample-workflow.ts
git commit -m "benchmark: scaffold benchmarkSampleWorkflow wrapper (skeleton)"
```

---

## Task 2: Test — wrapper runs graphWorkflow, writes prediction, returns slim result on happy path

**Files:**
- Create: `apps/temporal/src/benchmark-sample-workflow.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
const mockExecuteChild = jest.fn();
const mockProxyActivities = jest.fn();

jest.mock("@temporalio/workflow", () => ({
  executeChild: mockExecuteChild,
  proxyActivities: (...args: unknown[]) => mockProxyActivities(...args),
}));

import {
  benchmarkSampleWorkflow,
  type BenchmarkSampleWorkflowInput,
} from "./benchmark-sample-workflow";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

const writePrediction = jest.fn();
const persistOcrCache = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockProxyActivities.mockReturnValue({
    "benchmark.writePrediction": writePrediction,
    "benchmark.persistOcrCache": persistOcrCache,
  });
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
    writePrediction.mockResolvedValue({
      predictionPath: "/tmp/out/.benchmark-outputs/sample-001/sample-001-prediction.json",
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
    expect(writePrediction).toHaveBeenCalledWith({
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/temporal && npx jest benchmark-sample-workflow.test.ts -t "runs graphWorkflow"`
Expected: FAIL with `not implemented`.

- [ ] **Step 3: Implement the happy path**

Replace the stub body in `apps/temporal/src/benchmark-sample-workflow.ts` with:

```typescript
export async function benchmarkSampleWorkflow(
  input: BenchmarkSampleWorkflowInput,
): Promise<BenchmarkSampleWorkflowOutput> {
  const {
    sampleId,
    workflowConfig,
    configHash,
    inputPaths,
    outputBaseDir,
    sampleMetadata,
    predictionOutputDir,
    persistOcrCache,
    parentWorkflowId,
    requestId,
  } = input;

  const primaryInput = inputPaths[0] || "";
  const fileName = primaryInput.split("/").pop() || "document";
  const lowerName = fileName.toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i.test(lowerName);
  const fileType = isImage ? "image" : "pdf";
  const contentType = isImage
    ? lowerName.endsWith(".png")
      ? "image/png"
      : "image/jpeg"
    : "application/pdf";

  const initialCtx: Record<string, unknown> = {
    ...sampleMetadata,
    inputPaths,
    outputBaseDir,
    sampleId,
    documentId: `benchmark-${sampleId}`,
    blobKey: primaryInput,
    fileName,
    fileType,
    contentType,
  };

  const childInput: GraphWorkflowInput = {
    graph: workflowConfig,
    initialCtx,
    configHash,
    runnerVersion: GRAPH_RUNNER_VERSION,
    parentWorkflowId,
    requestId,
  };

  const graphResult = (await executeChild("graphWorkflow", {
    args: [childInput],
  })) as GraphWorkflowResult;

  const predictionData = buildFlatPredictionMapFromCtx(graphResult.ctx);
  const confidenceData = buildFlatConfidenceMapFromCtx(graphResult.ctx);

  const { predictionPath } = await customActivities[
    "benchmark.writePrediction"
  ]({
    predictionData,
    outputDir: predictionOutputDir,
    sampleId,
  });

  if (
    persistOcrCache &&
    graphResult.ctx.ocrResponse !== undefined &&
    graphResult.ctx.ocrResponse !== null
  ) {
    await customActivities["benchmark.persistOcrCache"]({
      sourceRunId: persistOcrCache.sourceRunId,
      sampleId,
      ocrResponse: graphResult.ctx.ocrResponse,
    });
  }

  const outputPaths = extractOutputPaths(graphResult.ctx);

  return {
    sampleId,
    success: graphResult.status === "completed",
    graphStatus: graphResult.status,
    completedNodes: graphResult.completedNodes.length,
    predictionPath,
    confidenceData,
    outputPaths,
  };
}

function extractOutputPaths(ctx: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (Array.isArray(ctx.outputPaths)) {
    for (const p of ctx.outputPaths) {
      if (typeof p === "string") paths.push(p);
    }
  }
  if (typeof ctx.outputPath === "string") {
    paths.push(ctx.outputPath);
  }
  return paths;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/temporal && npx jest benchmark-sample-workflow.test.ts -t "runs graphWorkflow"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/temporal/src/benchmark-sample-workflow.ts apps/temporal/src/benchmark-sample-workflow.test.ts
git commit -m "benchmark: implement benchmarkSampleWorkflow happy path with prediction write"
```

---

## Task 3: Test — wrapper persists OCR cache only when configured

**Files:**
- Modify: `apps/temporal/src/benchmark-sample-workflow.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe("benchmarkSampleWorkflow", ...)` block:

```typescript
  it("does not call persistOcrCache when persistOcrCache is undefined", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: { ocrResponse: { foo: "bar" } },
    });
    writePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow(baseInput);

    expect(persistOcrCache).not.toHaveBeenCalled();
  });

  it("calls persistOcrCache when persistOcrCache.sourceRunId is provided and ocrResponse exists", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "completed",
      completedNodes: ["n1"],
      ctx: { ocrResponse: { foo: "bar" } },
    });
    writePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow({
      ...baseInput,
      persistOcrCache: { sourceRunId: "run-42" },
    });

    expect(persistOcrCache).toHaveBeenCalledWith({
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
    writePrediction.mockResolvedValue({ predictionPath: "/p" });

    await benchmarkSampleWorkflow({
      ...baseInput,
      persistOcrCache: { sourceRunId: "run-42" },
    });

    expect(persistOcrCache).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to confirm they pass against the existing implementation**

Run: `cd apps/temporal && npx jest benchmark-sample-workflow.test.ts`
Expected: all four tests PASS (the implementation from Task 2 already covers these cases — these tests pin the behaviour).

- [ ] **Step 3: Commit**

```bash
git add apps/temporal/src/benchmark-sample-workflow.test.ts
git commit -m "benchmark: pin persistOcrCache conditional behaviour with tests"
```

---

## Task 4: Test — wrapper reports failure status from inner graphWorkflow without throwing

**Files:**
- Modify: `apps/temporal/src/benchmark-sample-workflow.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe` block:

```typescript
  it("returns success=false with graphStatus when inner graphWorkflow returns status=failed", async () => {
    mockExecuteChild.mockResolvedValue({
      status: "failed",
      completedNodes: ["n1"],
      ctx: { failedNodeId: "n2" },
    });
    writePrediction.mockResolvedValue({ predictionPath: "/p" });

    const result = await benchmarkSampleWorkflow(baseInput);

    expect(result.success).toBe(false);
    expect(result.graphStatus).toBe("failed");
    expect(result.error).toEqual({
      message: "graphWorkflow status: failed",
      failedNodeId: "n2",
    });
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/temporal && npx jest benchmark-sample-workflow.test.ts -t "returns success=false"`
Expected: FAIL — current implementation does not populate `error`.

- [ ] **Step 3: Update the implementation**

In `apps/temporal/src/benchmark-sample-workflow.ts`, replace the `return { ... }` at the end of `benchmarkSampleWorkflow` with:

```typescript
  const success = graphResult.status === "completed";

  const error = success
    ? undefined
    : {
        message: `graphWorkflow status: ${graphResult.status}`,
        failedNodeId:
          typeof graphResult.ctx.failedNodeId === "string"
            ? graphResult.ctx.failedNodeId
            : undefined,
      };

  return {
    sampleId,
    success,
    graphStatus: graphResult.status,
    completedNodes: graphResult.completedNodes.length,
    predictionPath,
    confidenceData,
    outputPaths,
    error,
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/temporal && npx jest benchmark-sample-workflow.test.ts`
Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/temporal/src/benchmark-sample-workflow.ts apps/temporal/src/benchmark-sample-workflow.test.ts
git commit -m "benchmark: report graphWorkflow failure status in wrapper output"
```

---

## Task 5: Register the new wrapper workflow in the benchmark workflow bundle

**Files:**
- Modify: `apps/temporal/src/benchmark-workflows.ts`

- [ ] **Step 1: Read current contents**

```bash
cat apps/temporal/src/benchmark-workflows.ts
```

Expected current contents:

```typescript
/**
 * Benchmark workflow bundle entry point.
 *
 * The benchmark worker needs both `benchmarkRunWorkflow` (orchestrator) and
 * `graphWorkflow` (child workflow executed per sample) in its bundle.
 * Temporal's `workflowsPath` accepts a single module, so this file
 * re-exports both for the worker to load them together.
 */

export { benchmarkRunWorkflow } from "./benchmark-workflow";
export { graphWorkflow } from "./graph-workflow";
```

- [ ] **Step 2: Add the new export**

Use `Edit` to change `apps/temporal/src/benchmark-workflows.ts`:

old_string:
```typescript
export { benchmarkRunWorkflow } from "./benchmark-workflow";
export { graphWorkflow } from "./graph-workflow";
```

new_string:
```typescript
export { benchmarkRunWorkflow } from "./benchmark-workflow";
export { graphWorkflow } from "./graph-workflow";
export { benchmarkSampleWorkflow } from "./benchmark-sample-workflow";
```

Update the docblock too:

old_string:
```typescript
 * The benchmark worker needs both `benchmarkRunWorkflow` (orchestrator) and
 * `graphWorkflow` (child workflow executed per sample) in its bundle.
 * Temporal's `workflowsPath` accepts a single module, so this file
 * re-exports both for the worker to load them together.
```

new_string:
```typescript
 * The benchmark worker needs `benchmarkRunWorkflow` (orchestrator),
 * `benchmarkSampleWorkflow` (per-sample wrapper that absorbs heavy
 * payloads into its own history), and `graphWorkflow` (the inner
 * workflow that the wrapper invokes). Temporal's `workflowsPath`
 * accepts a single module, so this file re-exports them together.
```

- [ ] **Step 3: Verify the worker bundle still type-checks**

Run: `cd apps/temporal && npx tsc --noEmit`
Expected: exit 0 (no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/temporal/src/benchmark-workflows.ts
git commit -m "benchmark: register benchmarkSampleWorkflow in worker bundle"
```

---

## Task 6: Test — `benchmarkExecuteWorkflow` calls the new wrapper and returns slim shape

**Files:**
- Modify: `apps/temporal/src/activities/benchmark-execute.test.ts`

- [ ] **Step 1: Read the existing test file to understand the surrounding fixtures**

```bash
cat apps/temporal/src/activities/benchmark-execute.test.ts
```

- [ ] **Step 2: Replace the existing tests**

The test file currently asserts `executeChild("graphWorkflow", ...)` and accesses `result.workflowResult`. Replace **all** of its tests (the whole `describe("benchmarkExecuteWorkflow", ...)` body) with:

```typescript
  const mockChildResult = {
    sampleId: "sample-001",
    success: true,
    graphStatus: "completed" as const,
    completedNodes: 3,
    predictionPath: "/tmp/out/.benchmark-outputs/sample-001/sample-001-prediction.json",
    confidenceData: { name: 0.99 } as Record<string, number | null>,
    outputPaths: ["/tmp/out/doc.json"],
  };

  beforeEach(() => {
    mockExecuteChild.mockReset();
    mockWorkflowInfo.mockReturnValue({ workflowId: "parent-wf-id" });
  });

  it("dispatches benchmarkSampleWorkflow on the configured task queue", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow({
      ...baseInput,
      predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
    });

    expect(mockExecuteChild).toHaveBeenCalledWith(
      "benchmarkSampleWorkflow",
      expect.objectContaining({
        taskQueue: "benchmark-processing",
        workflowId: "benchmark-parent-wf-id-sample-001",
        workflowExecutionTimeout: expect.any(Number),
      }),
    );
  });

  it("forwards persistOcrCache.sourceRunId to the wrapper", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    await benchmarkExecuteWorkflow({
      ...baseInput,
      predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
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

  it("returns the slim child output without workflowResult", async () => {
    mockExecuteChild.mockResolvedValue(mockChildResult);

    const result = await benchmarkExecuteWorkflow({
      ...baseInput,
      predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
    });

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
  });

  it("propagates failure with error message when wrapper returns success=false", async () => {
    mockExecuteChild.mockResolvedValue({
      ...mockChildResult,
      success: false,
      graphStatus: "failed",
      error: { message: "graphWorkflow status: failed", failedNodeId: "n2" },
    });

    const result = await benchmarkExecuteWorkflow({
      ...baseInput,
      predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
    });

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

    const result = await benchmarkExecuteWorkflow({
      ...baseInput,
      predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/Child Workflow execution failed/);
  });
```

Also update `baseInput` near the top of the file (it currently lacks `predictionOutputDir`) — find the existing object literal and add the field. Example shape:

```typescript
const baseInput: BenchmarkExecuteInput = {
  sampleId: "sample-001",
  workflowConfig: mockWorkflowConfig,
  configHash: "abc123hash",
  inputPaths: ["/tmp/in/doc.pdf"],
  outputBaseDir: "/tmp/out",
  sampleMetadata: {},
  predictionOutputDir: "/tmp/out/.benchmark-outputs/sample-001",
};
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `cd apps/temporal && npx jest benchmark-execute.test.ts`
Expected: failures referencing missing `predictionOutputDir`, missing wrapper dispatch, etc.

- [ ] **Step 4: Update `BenchmarkExecuteInput` and `BenchmarkExecuteOutput` and the implementation**

In `apps/temporal/src/activities/benchmark-execute.ts`:

Replace the existing `BenchmarkExecuteInput` interface with:

```typescript
export interface BenchmarkExecuteInput {
  sampleId: string;
  workflowConfig: GraphWorkflowConfig;
  configHash: string;
  inputPaths: string[];
  outputBaseDir: string;
  sampleMetadata: Record<string, unknown>;
  /** Directory under which the per-sample prediction JSON should be written. */
  predictionOutputDir: string;
  /** When set, wrapper persists OCR response under this benchmark run id. */
  persistOcrCache?: { sourceRunId: string };
  timeoutMs?: number;
  taskQueue?: string;
  parentWorkflowId?: string;
  requestId?: string;
}
```

Replace the existing `BenchmarkExecuteOutput` interface with:

```typescript
export interface BenchmarkExecuteOutput {
  sampleId: string;
  success: boolean;
  /** Path to per-sample prediction JSON written by the wrapper child. */
  predictionPath?: string;
  /** Per-field confidence map flattened from the inner workflow ctx. */
  confidenceData?: Record<string, number | null>;
  /** Output paths reported by the inner workflow ctx. */
  outputPaths: string[];
  error?: { message: string; failedNodeId?: string; type?: string };
  durationMs: number;
}
```

Replace the body of `benchmarkExecuteWorkflow` (the function) with:

```typescript
export async function benchmarkExecuteWorkflow(
  params: BenchmarkExecuteInput,
): Promise<BenchmarkExecuteOutput> {
  const startTime = Date.now();
  const {
    sampleId,
    workflowConfig,
    configHash,
    inputPaths,
    outputBaseDir,
    sampleMetadata,
    predictionOutputDir,
    persistOcrCache,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    taskQueue = BENCHMARK_TASK_QUEUE,
    requestId,
  } = params;

  const parentWorkflowId = workflowInfo().workflowId;
  const childWorkflowId = `benchmark-${parentWorkflowId}-${sampleId}`;

  console.log(
    JSON.stringify({
      activity: "benchmarkExecuteWorkflow",
      event: "start",
      sampleId,
      parentWorkflowId,
      taskQueue,
      childWorkflowId,
      timeoutMs,
      timestamp: new Date().toISOString(),
    }),
  );

  try {
    const childResult = (await executeChild("benchmarkSampleWorkflow", {
      args: [
        {
          sampleId,
          workflowConfig,
          configHash,
          inputPaths,
          outputBaseDir,
          sampleMetadata,
          predictionOutputDir,
          persistOcrCache,
          parentWorkflowId,
          requestId,
        },
      ],
      taskQueue,
      workflowId: childWorkflowId,
      workflowExecutionTimeout: timeoutMs,
    })) as {
      sampleId: string;
      success: boolean;
      graphStatus?: "completed" | "failed" | "cancelled";
      completedNodes?: number;
      predictionPath?: string;
      confidenceData?: Record<string, number | null>;
      outputPaths: string[];
      error?: { message: string; failedNodeId?: string };
    };

    const durationMs = Date.now() - startTime;

    console.log(
      JSON.stringify({
        activity: "benchmarkExecuteWorkflow",
        event: "complete",
        sampleId,
        status: childResult.graphStatus ?? (childResult.success ? "completed" : "failed"),
        completedNodes: childResult.completedNodes ?? 0,
        outputPaths: childResult.outputPaths.length,
        durationMs,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      sampleId,
      success: childResult.success,
      predictionPath: childResult.predictionPath,
      confidenceData: childResult.confidenceData,
      outputPaths: childResult.outputPaths,
      error: childResult.error
        ? {
            message: childResult.error.message,
            failedNodeId: childResult.error.failedNodeId,
          }
        : undefined,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorType = extractErrorType(error);
    const errorName = error instanceof Error ? error.name : undefined;
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorCauseRaw =
      error && typeof error === "object" && "cause" in error
        ? (error as { cause?: unknown }).cause
        : undefined;
    const errorCause =
      errorCauseRaw instanceof Error
        ? { name: errorCauseRaw.name, message: errorCauseRaw.message }
        : errorCauseRaw;

    console.log(
      JSON.stringify({
        activity: "benchmarkExecuteWorkflow",
        event: "error",
        sampleId,
        parentWorkflowId,
        childWorkflowId,
        taskQueue,
        timeoutMs,
        error: errorMessage,
        errorName,
        errorStack,
        errorCause,
        errorType,
        durationMs,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      sampleId,
      success: false,
      outputPaths: [],
      error: { message: errorMessage, type: errorType },
      durationMs,
    };
  }
}
```

Then **delete** the now‑unused helpers `extractOutputPaths` and `findFailedNodeId` from this file (they live in the wrapper now). Keep `extractErrorType` — it's still used in the catch block.

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `cd apps/temporal && npx jest benchmark-execute.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/temporal/src/activities/benchmark-execute.ts apps/temporal/src/activities/benchmark-execute.test.ts
git commit -m "benchmark: route benchmarkExecuteWorkflow through wrapper child workflow"
```

---

## Task 7: Test — parent benchmarkRunWorkflow no longer accesses `workflowResult.ctx`

**Files:**
- Modify: `apps/temporal/src/benchmark-workflow.test.ts` (only the tests touching the per‑sample loop)

- [ ] **Step 1: Search the existing test file for assertions against `workflowResult` / `persistOcrCache` / `writePrediction`**

Run: `grep -n "workflowResult\|persistOcrCache\|writePrediction" apps/temporal/src/benchmark-workflow.test.ts`

For each match, update the assertion or fixture:
- Replace fixtures that supplied `workflowResult: { ctx: { cleanedResult: ... } }` with fixtures that supply `predictionPath: "/path"` and `confidenceData: { ... }` directly on the `executeOutput` mock.
- Remove any expectation that the parent calls `benchmark.persistOcrCache` or `benchmark.writePrediction` itself — those calls now happen inside the wrapper, which is mocked at the `executeChild` boundary.
- Add `predictionPath` and `confidenceData` to the mock returns where executions are simulated as successful.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd apps/temporal && npx jest benchmark-workflow.test.ts`
Expected: failures pointing at the parent still trying to call `persistOcrCache` / `writePrediction` itself.

- [ ] **Step 3: Update parent workflow to consume the slim shape**

In `apps/temporal/src/benchmark-workflow.ts`:

**Remove** the parent‑side `persistOcrCache` block ([lines 523‑533 in current code](../../../apps/temporal/src/benchmark-workflow.ts#L523-L533)):

```typescript
// REMOVE THIS BLOCK
if (
  executeOutput.success &&
  persistOcrCache &&
  executeOutput.workflowResult?.ctx?.ocrResponse != null
) {
  await customActivities["benchmark.persistOcrCache"]({
    sourceRunId: runId,
    sampleId: sample.id,
    ocrResponse: executeOutput.workflowResult.ctx.ocrResponse,
  });
}
```

**Replace** the prediction‑extraction block (around current lines 574‑608, the `if (executeOutput.success)` branch that uses `workflowResult?.ctx`) with:

```typescript
        if (executeOutput.success) {
          try {
            if (!executeOutput.predictionPath) {
              throw new Error(
                `wrapper returned success without predictionPath for sample ${sample.id}`,
              );
            }

            const evaluationResult = await customActivities[
              "benchmark.evaluate"
            ]({
              sampleId: sample.id,
              inputPaths,
              predictionPaths: [executeOutput.predictionPath],
              predictionConfidences: executeOutput.confidenceData ?? {},
              groundTruthPaths,
              metadata: sample.metadata,
              evaluatorType,
              evaluatorConfig,
            });

            evaluationResults.push(evaluationResult);

            if (!evaluationResult.pass) {
              failedSamples++;
            }
          } catch (error) {
            failedSamples++;
            evaluationResults.push({
              sampleId: sample.id,
              metrics: {},
              diagnostics: { error: getErrorMessage(error) },
              pass: false,
            });
          }
        } else {
          failedSamples++;
          evaluationResults.push({
            sampleId: sample.id,
            metrics: {},
            diagnostics: {
              executionError: executeOutput.error?.message || "Unknown error",
            },
            pass: false,
          });
        }
```

**Update** the `benchmarkExecuteWorkflow` call site (around current line 504‑521) to pass `predictionOutputDir` and forward `persistOcrCache`:

```typescript
              const executeInput: BenchmarkExecuteInput = {
                sampleId: sample.id,
                workflowConfig,
                configHash: workflowConfigHash,
                inputPaths,
                outputBaseDir,
                sampleMetadata: {
                  ...sample.metadata,
                  ...(ocrCachePayload
                    ? { __benchmarkOcrCache: ocrCachePayload }
                    : {}),
                },
                predictionOutputDir: joinPath(
                  materializedPath!,
                  ".benchmark-outputs",
                  sample.id,
                ),
                persistOcrCache: persistOcrCache
                  ? { sourceRunId: runId }
                  : undefined,
                timeoutMs,
                taskQueue: childTaskQueue,
              };
```

Finally, **remove** the `benchmark.writePrediction` and `benchmark.persistOcrCache` entries from the `customActivities` proxyActivities declaration in this file (search for `proxyActivities` near the top), since the parent no longer calls them. Also remove the unused imports of `buildFlatPredictionMapFromCtx` / `buildFlatConfidenceMapFromCtx` from this file (they live in the wrapper now).

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/temporal && npx jest benchmark-workflow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/temporal/src/benchmark-workflow.ts apps/temporal/src/benchmark-workflow.test.ts
git commit -m "benchmark: consume slim wrapper output in parent orchestrator"
```

---

## Task 8: Run the full apps/temporal test suite to catch indirect regressions

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/temporal && npm test`
Expected: PASS for all suites.

- [ ] **Step 2: Type-check**

Run: `cd apps/temporal && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `cd apps/temporal && npm run lint`
Expected: exit 0.

- [ ] **Step 4: If anything fails, fix the failure (do NOT skip the test) and re-run from step 1**

The most likely failure modes:
- A leftover usage of `executeOutput.workflowResult` somewhere in `benchmark-workflow.ts` — search and remove.
- A test fixture in `benchmark-workflow.test.ts` that still constructs a `workflowResult` shape — update it to use the new slim shape.
- An unused import in `benchmark-execute.ts` after removing helpers.

- [ ] **Step 5: Commit any fixups**

```bash
git add -A
git commit -m "benchmark: cleanup leftovers from history-bloat fix"
```

(Skip this step if there were no fixups to commit.)

---

## Task 9: Documentation note

**Files:**
- Create: `docs-md/benchmarking/temporal-history-bloat-fix.md`

- [ ] **Step 1: Create the doc**

```markdown
# Benchmark history bloat fix (2026-05-04)

## Symptom

Large benchmark runs (~100 documents) failed with one of:

- Temporal server log: `Workflow history size exceeds limit` and the parent
  `benchmarkRunWorkflow` execution closed (terminated by the server) before
  it could write `status="completed"` to the DB. The benchmark run row stayed
  in `running` state indefinitely.
- Per-sample child workflows timed out at the 5-minute
  `workflowExecutionTimeout` even though their activities had completed in a
  few seconds.

## Root cause

Each per-sample child workflow returned its full graph workflow ctx
(predictions and the raw Azure OCR response, ~600 KB per sample) back to the
parent benchmark orchestrator. Both the `ChildWorkflowExecutionCompleted`
event payload and the parent-side `benchmark.persistOcrCache` /
`benchmark.writePrediction` activity arguments stored that ~600 KB inline in
the parent's history. At ~85 samples the parent history exceeded Temporal's
default 50 MB error limit and was server-terminated.

The same bloat also caused worker-thread starvation: each parent activation
required replaying tens of MB on the single workflow thread
(`workflowThreadPoolSize: 1`), preventing any child workflow from being
activated and so children sat idle until they hit their 5-minute execution
timeout.

## Fix

Inserted a thin per-sample wrapper child workflow,
`benchmarkSampleWorkflow`, between the parent benchmark orchestrator and the
existing generic `graphWorkflow`. The wrapper now performs the prediction
write and OCR cache persistence inside its own workflow context, so the
heavy payloads stay in the wrapper's history (small, per-sample) and never
flow to the parent. The wrapper returns only `{ sampleId, success,
predictionPath, confidenceData, outputPaths, error? }`.

After the change, the parent's history at 100 samples is roughly 5 MB
instead of ~50 MB, well below the server limit, and replays fast enough that
children no longer starve.

## Files

- `apps/temporal/src/benchmark-sample-workflow.ts` (new)
- `apps/temporal/src/benchmark-workflows.ts` (registers the new workflow)
- `apps/temporal/src/activities/benchmark-execute.ts` (dispatches the wrapper)
- `apps/temporal/src/benchmark-workflow.ts` (consumes the slim shape)
```

- [ ] **Step 2: Commit**

```bash
git add docs-md/benchmarking/temporal-history-bloat-fix.md
git commit -m "docs: add note on benchmark history-bloat fix"
```

---

## Task 10: Manual verification before deploying to production

**Files:** none modified.

- [ ] **Step 1: Local smoke test**

Run a small benchmark locally (or in dev) with ~5 samples to verify the change end-to-end:
- Start the temporal worker locally
- Trigger a benchmark via the API
- Confirm the run reaches `status="completed"` and the UI shows metrics
- Confirm a `BenchmarkOcrCache` row was written for each sample (only if `persistOcrCache=true`)
- Confirm `apps/temporal/.../benchmark-outputs/<sampleId>/<sampleId>-prediction.json` exists for each sample

- [ ] **Step 2: Push branch and open PR against develop**

```bash
git push -u origin fix/benchmark-history-bloat-via-wrapper-workflow
gh pr create --base develop --title "fix(benchmark): wrapper child workflow to absorb per-sample payloads" --body "$(cat <<'EOF'
## Summary
- Adds `benchmarkSampleWorkflow` wrapper child workflow that absorbs per-sample OCR/prediction payloads into its own Temporal history
- Parent `benchmarkRunWorkflow` history now stays ~5 MB at 100 samples instead of ~50 MB
- Eliminates both the 50 MB server-termination failure mode and the worker-thread starvation that was causing 5-min child workflow timeouts

## Test plan
- [ ] `apps/temporal` unit tests pass (`npm test`)
- [ ] Type-check + lint pass
- [ ] Manual: 5-sample dev benchmark completes end-to-end
- [ ] Manual after merge to develop and deploy to dev: re-run a 100-doc benchmark and confirm:
  - parent workflow `HistorySize` stays <10 MB
  - no child workflow timeouts
  - run row reaches `status=completed` with metrics
EOF
)"
```

- [ ] **Step 3: After merge to develop and dev deploy, run the 100-doc benchmark on dev**

Verify in Temporal UI:
- Parent workflow `HistorySize` stays under 10 MB (target: ~5 MB)
- No `ChildWorkflowFailure` / `TimeoutFailure` events on per-sample children
- Run row in DB transitions to `status="completed"` and the UI shows metrics + drill-down

If the dev run is clean, promote to prod via the normal develop → main release process.

---

## Self-Review (already done by plan author)

- **Spec coverage:** all four user-confirmed points are covered:
  1. Stop heavy data flowing through child→parent return → Task 2 (wrapper writes prediction, returns slim shape) + Task 6 (executor returns slim shape) + Task 7 (parent consumes slim shape).
  2. Move OCR cache write into the child's context → Task 3 (wrapper persists OCR cache when configured).
  3. Branch from develop → done before plan was written.
  4. Address timeouts via the same fix (no separate timeout bump) → confirmed in Background section + verified in Task 10 manual check.
- **Placeholder scan:** no TBDs, no "add error handling", no "similar to Task N", no "implement later".
- **Type consistency:** `BenchmarkExecuteInput.predictionOutputDir`, `BenchmarkSampleWorkflowInput.predictionOutputDir`, `executeInput.predictionOutputDir` all match. `persistOcrCache: { sourceRunId: string }` shape is identical across the three boundaries. Output shape (`predictionPath`, `confidenceData`, `outputPaths`, `error.message/failedNodeId`) is identical across `BenchmarkSampleWorkflowOutput`, `BenchmarkExecuteOutput`, and the parent's consumption.
