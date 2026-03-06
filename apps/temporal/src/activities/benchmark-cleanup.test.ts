/**
 * Tests for Benchmark Cleanup Activities
 *
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.4
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  benchmarkCleanup,
  BenchmarkCleanupInput,
} from "./benchmark-cleanup";

describe("Benchmark Cleanup Activities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-cleanup-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in test teardown
    }
  });

  describe("benchmarkCleanup", () => {
    it("should clean up materialized dataset files", async () => {
      const file1 = path.join(tempDir, "dataset-file-1.json");
      const file2 = path.join(tempDir, "dataset-file-2.json");

      await fs.writeFile(file1, JSON.stringify({ data: "test1" }));
      await fs.writeFile(file2, JSON.stringify({ data: "test2" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [file1, file2],
        temporaryOutputPaths: [],
      };

      await benchmarkCleanup(input);

      await expect(fs.access(file1)).rejects.toThrow();
      await expect(fs.access(file2)).rejects.toThrow();
    });

    it("should clean up per-run output files", async () => {
      const outputFile1 = path.join(tempDir, "output-1.json");
      const outputFile2 = path.join(tempDir, "output-2.json");

      await fs.writeFile(outputFile1, JSON.stringify({ result: "test1" }));
      await fs.writeFile(outputFile2, JSON.stringify({ result: "test2" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [],
        temporaryOutputPaths: [outputFile1, outputFile2],
      };

      await benchmarkCleanup(input);

      await expect(fs.access(outputFile1)).rejects.toThrow();
      await expect(fs.access(outputFile2)).rejects.toThrow();
    });

    it("should be idempotent when files are already deleted", async () => {
      const nonExistentFile1 = path.join(tempDir, "does-not-exist-1.json");
      const nonExistentFile2 = path.join(tempDir, "does-not-exist-2.json");

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [nonExistentFile1],
        temporaryOutputPaths: [nonExistentFile2],
      };

      await expect(benchmarkCleanup(input)).resolves.not.toThrow();
    });

    it("should clean up directories recursively", async () => {
      const datasetDir = path.join(tempDir, "dataset-materialized");
      const nestedFile = path.join(datasetDir, "nested", "file.json");

      await fs.mkdir(path.join(datasetDir, "nested"), { recursive: true });
      await fs.writeFile(nestedFile, JSON.stringify({ data: "nested" }));

      const input: BenchmarkCleanupInput = {
        materializedDatasetPaths: [datasetDir],
        temporaryOutputPaths: [],
      };

      await benchmarkCleanup(input);

      await expect(fs.access(datasetDir)).rejects.toThrow();
    });
  });
});
