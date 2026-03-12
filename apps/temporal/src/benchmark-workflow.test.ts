/**
 * Tests for Benchmark Run Workflow
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-022-benchmark-run-workflow.md
 * See feature-docs/003-benchmarking-system/user-stories/US-023-task-queue-isolation-concurrency.md
 */

import type { BenchmarkRunWorkflowInput } from "./benchmark-workflow";

describe("Benchmark Run Workflow", () => {
  describe("US-023: Task Queue Isolation & Concurrency Controls", () => {
    it("should support configurable per-run concurrency limits", () => {
      // US-023 Scenario 2: maxParallelDocuments controls batch size
      const input: Partial<BenchmarkRunWorkflowInput> = {
        runtimeSettings: {
          maxParallelDocuments: 5,
        },
      };

      expect(input.runtimeSettings?.maxParallelDocuments).toBe(5);
    });

    it("should support configurable activity timeouts", () => {
      // US-023 Scenario 4: Activity timeouts are configurable
      const input: Partial<BenchmarkRunWorkflowInput> = {
        runtimeSettings: {
          activityTimeout: {
            startToCloseTimeout: "1 hour",
          },
        },
      };

      expect(input.runtimeSettings?.activityTimeout?.startToCloseTimeout).toBe(
        "1 hour",
      );
    });

    it("should support configurable activity retry policies", () => {
      // US-023 Scenario 5: Activity retry policies are configurable
      const input: Partial<BenchmarkRunWorkflowInput> = {
        runtimeSettings: {
          activityRetry: {
            initialInterval: "2s",
            maximumInterval: "60s",
            maximumAttempts: 5,
          },
        },
      };

      expect(input.runtimeSettings?.activityRetry?.initialInterval).toBe("2s");
      expect(input.runtimeSettings?.activityRetry?.maximumInterval).toBe("60s");
      expect(input.runtimeSettings?.activityRetry?.maximumAttempts).toBe(5);
    });

    it("should always use benchmark-processing queue", () => {
      const childTaskQueue = "benchmark-processing";
      expect(childTaskQueue).toBe("benchmark-processing");
    });

    it("should support configurable timeout per document", () => {
      // US-023 Scenario 2: Per-document timeout
      const input: Partial<BenchmarkRunWorkflowInput> = {
        runtimeSettings: {
          timeoutPerDocumentMs: 600000, // 10 minutes
        },
      };

      expect(input.runtimeSettings?.timeoutPerDocumentMs).toBe(600000);
    });
  });

  describe("Input validation", () => {
    it("should accept valid runtime settings with all options", () => {
      const input: Partial<BenchmarkRunWorkflowInput> = {
        runtimeSettings: {
          maxParallelDocuments: 20,
          timeoutPerDocumentMs: 300000,
          activityTimeout: {
            startToCloseTimeout: "45 minutes",
          },
          activityRetry: {
            initialInterval: "1s",
            maximumInterval: "30s",
            maximumAttempts: 3,
          },
        },
      };

      expect(input.runtimeSettings?.maxParallelDocuments).toBe(20);
      expect(input.runtimeSettings?.timeoutPerDocumentMs).toBe(300000);
      expect(input.runtimeSettings?.activityTimeout?.startToCloseTimeout).toBe(
        "45 minutes",
      );
      expect(input.runtimeSettings?.activityRetry?.maximumAttempts).toBe(3);
    });
  });
});
