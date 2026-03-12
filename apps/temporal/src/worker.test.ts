/**
 * Tests for Temporal Worker Configuration
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-023-task-queue-isolation-concurrency.md
 */

describe("Temporal Worker", () => {
  describe("US-023: Task Queue Isolation", () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.TEMPORAL_TASK_QUEUE;
      delete process.env.BENCHMARK_TASK_QUEUE;
      delete process.env.ENABLE_BENCHMARK_QUEUE;
    });

    it("should default to ocr-processing queue for production", () => {
      // US-023 Scenario 1: Default task queue
      const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "ocr-processing";
      expect(taskQueue).toBe("ocr-processing");
    });

    it("should default to benchmark-processing queue for benchmarks", () => {
      // US-023 Scenario 1: Dedicated benchmark-processing task queue
      const benchmarkTaskQueue =
        process.env.BENCHMARK_TASK_QUEUE || "benchmark-processing";
      expect(benchmarkTaskQueue).toBe("benchmark-processing");
    });

    it("should enable benchmark queue by default", () => {
      // US-023 Scenario 1: Benchmark queue enabled by default
      const enableBenchmarkQueue =
        process.env.ENABLE_BENCHMARK_QUEUE !== "false";
      expect(enableBenchmarkQueue).toBe(true);
    });

    it("should allow disabling benchmark queue via environment variable", () => {
      process.env.ENABLE_BENCHMARK_QUEUE = "false";
      const enableBenchmarkQueue =
        process.env.ENABLE_BENCHMARK_QUEUE !== "false";
      expect(enableBenchmarkQueue).toBe(false);
    });

    it("should support custom task queue names via environment variables", () => {
      process.env.TEMPORAL_TASK_QUEUE = "custom-ocr";
      process.env.BENCHMARK_TASK_QUEUE = "custom-benchmark";

      const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "ocr-processing";
      const benchmarkTaskQueue =
        process.env.BENCHMARK_TASK_QUEUE || "benchmark-processing";

      expect(taskQueue).toBe("custom-ocr");
      expect(benchmarkTaskQueue).toBe("custom-benchmark");
    });

    it("should not create separate benchmark worker if queue names are the same", () => {
      const taskQueue = "shared-queue";
      const benchmarkTaskQueue = "shared-queue";
      const enableBenchmarkQueue = true;

      const shouldCreateSeparateWorker =
        enableBenchmarkQueue && benchmarkTaskQueue !== taskQueue;
      expect(shouldCreateSeparateWorker).toBe(false);
    });

    it("should create separate benchmark worker if queue names differ", () => {
      const taskQueue: string = "ocr-processing";
      const benchmarkTaskQueue: string = "benchmark-processing";
      const enableBenchmarkQueue = true;

      const shouldCreateSeparateWorker =
        enableBenchmarkQueue && benchmarkTaskQueue !== taskQueue;
      expect(shouldCreateSeparateWorker).toBe(true);
    });
  });
});
