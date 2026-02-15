/**
 * Tests for Benchmark Logging & Cleanup Activities
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-021-mlflow-logging-cleanup-activities.md
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import {
  benchmarkLogToMlflow,
  benchmarkCleanup,
  BenchmarkLogToMlflowInput,
  BenchmarkCleanupInput,
} from "./benchmark-logging";

describe("Benchmark Logging Activities", () => {
  let mock: MockAdapter;
  let tempDir: string;

  beforeEach(async () => {
    // Create mock axios adapter
    mock = new MockAdapter(axios);

    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-logging-test-"));
  });

  afterEach(async () => {
    // Reset mock
    mock.restore();

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("benchmarkLogToMlflow", () => {
    it("should log required parameters from Section 6.3", async () => {
      // Scenario 1: Log run parameters to MLflow
      const input: BenchmarkLogToMlflowInput = {
        mlflowRunId: "test-run-123",
        params: {
          dataset_version_id: "dv-123",
          dataset_git_revision: "abc123def",
          workflow_config_hash: "hash-456",
          evaluator_type: "schema-aware",
          evaluator_config_hash: "eval-hash-789",
        },
        metrics: {},
        tags: {},
        status: "FINISHED",
      };

      // Mock all parameter logging calls
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/log-parameter")
        .reply(200, {});

      // Mock status update
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/update")
        .reply(200, {});

      await benchmarkLogToMlflow(input);

      // Verify all required params were logged
      const paramCalls = mock.history.post.filter(
        (call: { url?: string; baseURL?: string }) =>
          call.url === "/api/2.0/mlflow/runs/log-parameter" &&
          call.baseURL === "http://localhost:5000",
      );

      expect(paramCalls.length).toBe(5);

      const loggedParams = paramCalls.map((call: { data?: string }) => JSON.parse(call.data || "{}"));
      expect(loggedParams).toContainEqual({
        run_id: "test-run-123",
        key: "dataset_version_id",
        value: "dv-123",
      });
      expect(loggedParams).toContainEqual({
        run_id: "test-run-123",
        key: "dataset_git_revision",
        value: "abc123def",
      });
      expect(loggedParams).toContainEqual({
        run_id: "test-run-123",
        key: "workflow_config_hash",
        value: "hash-456",
      });
      expect(loggedParams).toContainEqual({
        run_id: "test-run-123",
        key: "evaluator_type",
        value: "schema-aware",
      });
      expect(loggedParams).toContainEqual({
        run_id: "test-run-123",
        key: "evaluator_config_hash",
        value: "eval-hash-789",
      });
    });

    it("should log aggregated metrics to MLflow", async () => {
      // Scenario 2: Log aggregated metrics to MLflow
      const input: BenchmarkLogToMlflowInput = {
        mlflowRunId: "test-run-123",
        params: {},
        metrics: {
          "mean_f1": 0.85,
          "mean_precision": 0.88,
          "mean_recall": 0.82,
          "field_scores.invoice_number.f1": 0.95,
          "field_scores.total_amount.f1": 0.78,
        },
        tags: {},
        status: "FINISHED",
      };

      // Mock metric logging calls
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/log-metric")
        .reply(200, {});

      // Mock status update
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/update")
        .reply(200, {});

      await benchmarkLogToMlflow(input);

      // Verify all metrics were logged
      const metricCalls = mock.history.post.filter(
        (call: { url?: string; baseURL?: string }) =>
          call.url === "/api/2.0/mlflow/runs/log-metric" &&
          call.baseURL === "http://localhost:5000",
      );

      expect(metricCalls.length).toBe(5);

      const loggedMetrics = metricCalls.map((call: { data?: string }) => JSON.parse(call.data || "{}"));

      expect(loggedMetrics).toContainEqual(
        expect.objectContaining({
          run_id: "test-run-123",
          key: "mean_f1",
          value: 0.85,
          step: 0,
        }),
      );
      expect(loggedMetrics).toContainEqual(
        expect.objectContaining({
          run_id: "test-run-123",
          key: "mean_precision",
          value: 0.88,
          step: 0,
        }),
      );
      expect(loggedMetrics).toContainEqual(
        expect.objectContaining({
          run_id: "test-run-123",
          key: "mean_recall",
          value: 0.82,
          step: 0,
        }),
      );
    });

    it("should set required tags from Section 6.3", async () => {
      // Scenario 3: Set run tags on MLflow
      const input: BenchmarkLogToMlflowInput = {
        mlflowRunId: "test-run-123",
        params: {},
        metrics: {},
        tags: {
          worker_image_digest: "sha256:abc123",
          worker_git_sha: "def456",
          benchmark_run_id: "run-789",
          benchmark_definition_id: "def-101",
          benchmark_project_id: "proj-202",
        },
        status: "FINISHED",
      };

      // Mock tag setting calls
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/set-tag")
        .reply(200, {});

      // Mock status update
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/update")
        .reply(200, {});

      await benchmarkLogToMlflow(input);

      // Verify all required tags were set
      const tagCalls = mock.history.post.filter(
        (call: { url?: string; baseURL?: string }) =>
          call.url === "/api/2.0/mlflow/runs/set-tag" &&
          call.baseURL === "http://localhost:5000",
      );

      expect(tagCalls.length).toBe(5);

      const setTags = tagCalls.map((call: { data?: string }) => JSON.parse(call.data || "{}"));
      expect(setTags).toContainEqual({
        run_id: "test-run-123",
        key: "worker_image_digest",
        value: "sha256:abc123",
      });
      expect(setTags).toContainEqual({
        run_id: "test-run-123",
        key: "worker_git_sha",
        value: "def456",
      });
      expect(setTags).toContainEqual({
        run_id: "test-run-123",
        key: "benchmark_run_id",
        value: "run-789",
      });
      expect(setTags).toContainEqual({
        run_id: "test-run-123",
        key: "benchmark_definition_id",
        value: "def-101",
      });
      expect(setTags).toContainEqual({
        run_id: "test-run-123",
        key: "benchmark_project_id",
        value: "proj-202",
      });
    });

    it("should handle artifacts (with warning for future implementation)", async () => {
      // Scenario 4: Log artifacts to MLflow
      const input: BenchmarkLogToMlflowInput = {
        mlflowRunId: "test-run-123",
        params: {},
        metrics: {},
        tags: {},
        artifactPaths: ["/tmp/artifact1.json", "/tmp/artifact2.json"],
        status: "FINISHED",
      };

      // Mock status update
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/update")
        .reply(200, {});

      // Should not throw even though artifact upload is not fully implemented
      await expect(benchmarkLogToMlflow(input)).resolves.not.toThrow();
    });

    it("should update MLflow run status to FINISHED on success", async () => {
      // Scenario 5: Update MLflow run status (success)
      const input: BenchmarkLogToMlflowInput = {
        mlflowRunId: "test-run-123",
        params: {},
        metrics: {},
        tags: {},
        status: "FINISHED",
      };

      // Mock status update
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/update")
        .reply(200, {});

      await benchmarkLogToMlflow(input);

      const statusCalls = mock.history.post.filter(
        (call: { url?: string; baseURL?: string }) =>
          call.url === "/api/2.0/mlflow/runs/update" &&
          call.baseURL === "http://localhost:5000",
      );

      expect(statusCalls.length).toBe(1);
      const statusUpdate = JSON.parse(statusCalls[0].data || "{}");
      expect(statusUpdate).toMatchObject({
        run_id: "test-run-123",
        status: "FINISHED",
      });
      expect(statusUpdate.end_time).toBeDefined();
    });

    it("should update MLflow run status to FAILED on failure", async () => {
      // Scenario 5: Update MLflow run status (failure)
      const input: BenchmarkLogToMlflowInput = {
        mlflowRunId: "test-run-123",
        params: {},
        metrics: {},
        tags: {},
        status: "FAILED",
      };

      // Mock status update
      mock
        .onPost("http://localhost:5000/api/2.0/mlflow/runs/update")
        .reply(200, {});

      await benchmarkLogToMlflow(input);

      const statusCalls = mock.history.post.filter(
        (call: { url?: string; baseURL?: string }) =>
          call.url === "/api/2.0/mlflow/runs/update" &&
          call.baseURL === "http://localhost:5000",
      );

      expect(statusCalls.length).toBe(1);
      const statusUpdate = JSON.parse(statusCalls[0].data || "{}");
      expect(statusUpdate).toMatchObject({
        run_id: "test-run-123",
        status: "FAILED",
      });
      expect(statusUpdate.end_time).toBeDefined();
    });
  });

  describe("benchmarkCleanup", () => {
    it("should clean up materialized dataset files", async () => {
      // Scenario 6: Clean up materialized dataset files
      const file1 = path.join(tempDir, "dataset-file-1.json");
      const file2 = path.join(tempDir, "dataset-file-2.json");

      // Create test files
      await fs.writeFile(file1, JSON.stringify({ data: "test1" }));
      await fs.writeFile(file2, JSON.stringify({ data: "test2" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [file1, file2],
        temporaryOutputPaths: [],
      };

      await benchmarkCleanup(input);

      // Verify files were deleted
      await expect(fs.access(file1)).rejects.toThrow();
      await expect(fs.access(file2)).rejects.toThrow();
    });

    it("should clean up per-run output files", async () => {
      // Scenario 7: Clean up per-run output files
      const outputFile1 = path.join(tempDir, "output-1.json");
      const outputFile2 = path.join(tempDir, "output-2.json");

      // Create test files
      await fs.writeFile(outputFile1, JSON.stringify({ result: "test1" }));
      await fs.writeFile(outputFile2, JSON.stringify({ result: "test2" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [],
        temporaryOutputPaths: [outputFile1, outputFile2],
      };

      await benchmarkCleanup(input);

      // Verify files were deleted
      await expect(fs.access(outputFile1)).rejects.toThrow();
      await expect(fs.access(outputFile2)).rejects.toThrow();
    });

    it("should be idempotent when files are already deleted", async () => {
      // Scenario 8: Cleanup is idempotent
      const nonExistentFile1 = path.join(tempDir, "does-not-exist-1.json");
      const nonExistentFile2 = path.join(tempDir, "does-not-exist-2.json");

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [nonExistentFile1],
        temporaryOutputPaths: [nonExistentFile2],
      };

      // Should complete successfully even though files don't exist
      await expect(benchmarkCleanup(input)).resolves.not.toThrow();
    });

    it("should clean up directories recursively", async () => {
      // Additional test: cleanup directories
      const datasetDir = path.join(tempDir, "dataset-materialized");
      const nestedFile = path.join(datasetDir, "nested", "file.json");

      // Create nested directory structure
      await fs.mkdir(path.join(datasetDir, "nested"), { recursive: true });
      await fs.writeFile(nestedFile, JSON.stringify({ data: "nested" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [datasetDir],
        temporaryOutputPaths: [],
      };

      await benchmarkCleanup(input);

      // Verify directory was deleted
      await expect(fs.access(datasetDir)).rejects.toThrow();
    });

    it("should handle mix of existing and non-existing files", async () => {
      // Additional test: mixed cleanup scenario
      const existingFile = path.join(tempDir, "exists.json");
      const nonExistingFile = path.join(tempDir, "does-not-exist.json");

      // Create only one file
      await fs.writeFile(existingFile, JSON.stringify({ data: "test" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [],
        temporaryOutputPaths: [existingFile, nonExistingFile],
      };

      // Should succeed and clean up existing file
      await expect(benchmarkCleanup(input)).resolves.not.toThrow();

      // Verify existing file was deleted
      await expect(fs.access(existingFile)).rejects.toThrow();
    });
  });
});
