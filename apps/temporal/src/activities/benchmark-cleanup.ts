/**
 * Benchmark Cleanup Activities
 *
 * Temporal activities for cleaning up temporary files after benchmark runs.
 *
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.4
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getGroupBenchmarkCacheDir } from "../blob-storage/read-group-blob";

/**
 * Input for benchmark.cleanup activity
 */
export interface BenchmarkCleanupInput {
  /**
   * Group that owns the run; only paths inside its benchmark cache are removed
   */
  groupId?: string;

  /**
   * Paths to materialized dataset files to clean up
   */
  materializedDatasetPaths?: string[];

  /**
   * Paths to temporary per-run output files to clean up
   */
  temporaryOutputPaths?: string[];

  /**
   * Whether to preserve cached datasets (default: true)
   */
  preserveCachedDatasets?: boolean;
}

/**
 * Clean up temporary files after benchmark run
 *
 * Activity type: benchmark.cleanup
 */
export async function benchmarkCleanup(
  input: BenchmarkCleanupInput,
): Promise<void> {
  const { materializedDatasetPaths = [], temporaryOutputPaths = [] } = input;
  if (!input.groupId) {
    throw new Error("groupId is required to clean up benchmark files");
  }
  const groupCacheDir = path.resolve(getGroupBenchmarkCacheDir(input.groupId));

  const errors: string[] = [];

  // Clean up materialized dataset files (respecting cache preservation)
  if (materializedDatasetPaths.length > 0) {
    for (const filePath of materializedDatasetPaths) {
      if (!isInsideDirectory(filePath, groupCacheDir)) {
        errors.push(
          `Not deleting ${filePath}: outside the group's benchmark cache`,
        );
        continue;
      }
      try {
        await removeFileOrDirectory(filePath);
      } catch (error) {
        // Only record error if file existed but couldn't be deleted
        const fileExists = await checkFileExists(filePath);
        if (fileExists) {
          errors.push(
            `Failed to delete materialized file ${filePath}: ${error}`,
          );
        }
        // If file doesn't exist, cleanup is idempotent - continue silently
      }
    }
  }

  // Clean up temporary per-run output files
  if (temporaryOutputPaths.length > 0) {
    for (const filePath of temporaryOutputPaths) {
      if (!isInsideDirectory(filePath, groupCacheDir)) {
        errors.push(
          `Not deleting ${filePath}: outside the group's benchmark cache`,
        );
        continue;
      }
      try {
        await removeFileOrDirectory(filePath);
      } catch (error) {
        // Only record error if file existed but couldn't be deleted
        const fileExists = await checkFileExists(filePath);
        if (fileExists) {
          errors.push(`Failed to delete temporary file ${filePath}: ${error}`);
        }
        // If file doesn't exist, cleanup is idempotent - continue silently
      }
    }
  }

  // If there were any actual deletion errors (not just missing files), throw
  if (errors.length > 0) {
    throw new Error(`Cleanup encountered errors:\n${errors.join("\n")}`);
  }
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Whether `filePath` resolves to a location strictly inside `directory`
 */
function isInsideDirectory(filePath: string, directory: string): boolean {
  return path.resolve(filePath).startsWith(directory + path.sep);
}

/**
 * Remove a file or directory (recursively)
 */
async function removeFileOrDirectory(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    await fs.rm(filePath, { recursive: true, force: true });
  } else {
    await fs.unlink(filePath);
  }
}

/**
 * Check if a file or directory exists
 */
async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
