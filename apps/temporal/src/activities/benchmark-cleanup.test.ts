/**
 * Tests for Benchmark Cleanup Activities
 *
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.4
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BenchmarkCleanupInput, benchmarkCleanup } from "./benchmark-cleanup";

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

function restoreCacheDir(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.BENCHMARK_CACHE_DIR;
  } else {
    process.env.BENCHMARK_CACHE_DIR = value;
  }
}

describe("Benchmark Cleanup Activities", () => {
  const ORIGINAL_CACHE_DIR = process.env.BENCHMARK_CACHE_DIR;
  let cacheRoot: string;
  let tempDir: string;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-cleanup-"));
    process.env.BENCHMARK_CACHE_DIR = cacheRoot;
    tempDir = path.join(cacheRoot, GROUP);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    restoreCacheDir(ORIGINAL_CACHE_DIR);
    try {
      await fs.rm(cacheRoot, { recursive: true, force: true });
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
        groupId: GROUP,
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
        groupId: GROUP,
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
        groupId: GROUP,
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
        groupId: GROUP,
        materializedDatasetPaths: [datasetDir],
        temporaryOutputPaths: [],
      };

      await benchmarkCleanup(input);

      await expect(fs.access(datasetDir)).rejects.toThrow();
    });

    it("leaves paths outside the group's benchmark cache in place", async () => {
      const otherGroupDir = path.join(cacheRoot, OTHER_GROUP);
      await fs.mkdir(otherGroupDir, { recursive: true });
      const otherGroupFile = path.join(otherGroupDir, "output.json");
      await fs.writeFile(otherGroupFile, "{}");
      const ownFile = path.join(tempDir, "output.json");
      await fs.writeFile(ownFile, "{}");

      await expect(
        benchmarkCleanup({
          groupId: GROUP,
          materializedDatasetPaths: [],
          temporaryOutputPaths: [
            otherGroupFile,
            `${tempDir}/../${OTHER_GROUP}`,
            ownFile,
          ],
        }),
      ).rejects.toThrow(/outside the group's benchmark cache/);

      await expect(fs.access(otherGroupFile)).resolves.toBeUndefined();
      await expect(fs.access(ownFile)).rejects.toThrow();
    });

    it("refuses to clean up without a groupId", async () => {
      const ownFile = path.join(tempDir, "output.json");
      await fs.writeFile(ownFile, "{}");

      await expect(
        benchmarkCleanup({
          materializedDatasetPaths: [],
          temporaryOutputPaths: [ownFile],
        }),
      ).rejects.toThrow(/groupId is required/);
      await expect(fs.access(ownFile)).resolves.toBeUndefined();
    });
  });
});
