import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@ai-di/blob-storage-paths";
import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { ApplicationFailure } from "@temporalio/common";
import { joinDatasetPath } from "../benchmark-dataset-paths";
import type { DatasetManifest } from "../benchmark-types";
import { getGroupBlobStorage } from "../blob-storage/group-blob-storage";
import { getGroupBenchmarkCacheDir } from "../blob-storage/read-group-blob";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

interface MaterializeDatasetParams {
  datasetVersionId: string;
}

/**
 * A sample id names files and folders on the worker, so it must be a single
 * path segment: a non-empty string with no `/`, `\` or NUL that is not `.`
 * or `..`.
 */
function isSafeSampleId(id: unknown): boolean {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id !== "." &&
    id !== ".." &&
    !/[/\\\0]/.test(id)
  );
}

interface MaterializeDatasetResult {
  materializedPath: string;
  /** Dataset tenant scope for OCR blob paths (`{groupId}/ocr/...`). */
  groupId: string;
}

/**
 * Activity: Materialize a pinned dataset version on the worker
 *
 * Downloads dataset files from object storage to a local cache directory.
 * Caches materialized datasets to avoid redundant operations.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-018-dataset-materialization-activity.md
 */
export async function materializeDataset(
  params: MaterializeDatasetParams,
): Promise<MaterializeDatasetResult> {
  const activityName = "materializeDataset";
  const startTime = Date.now();
  const { datasetVersionId } = params;
  const log = createActivityLogger(activityName, { datasetVersionId });

  log.info("Materialize dataset start", { event: "start" });

  try {
    const prisma = getPrismaClient();

    // Fetch dataset version and parent dataset details
    const datasetVersion = await prisma.datasetVersion.findUnique({
      where: { id: datasetVersionId },
      include: { dataset: true },
    });

    if (!datasetVersion) {
      throw new Error(`Dataset version not found: ${datasetVersionId}`);
    }

    const { dataset, storagePrefix } = datasetVersion;
    const { id: datasetId, group_id: groupId } = dataset;

    if (!storagePrefix) {
      throw new Error(
        `Dataset version ${datasetVersionId} has no storage prefix (no files uploaded)`,
      );
    }

    // storagePrefix in the DB is the relative portion
    // (e.g. "datasets/{datasetId}/{versionId}"). Backend writers prepend
    // "{groupId}/benchmark/" via buildBlobFilePath, so the real blob keys
    // live at "{groupId}/benchmark/{storagePrefix}/...". Rebuild the full
    // canonical prefix here before listing.
    const fullStoragePrefix = buildBlobPrefixPath(
      groupId,
      OperationCategory.BENCHMARK,
      [storagePrefix],
    );

    // Each group's datasets live in their own cache directory, the only
    // local location readGroupBlob accepts for that group's runs.
    const groupCacheDir = getGroupBenchmarkCacheDir(groupId);
    const cacheKey = `${datasetId}-${datasetVersionId}`;
    const materializedPath = path.join(groupCacheDir, cacheKey);

    log.info("Check cache", {
      event: "check_cache",
      cacheKey,
      materializedPath,
    });

    // Check if dataset is already cached by looking for the manifest
    const manifestLocalPath = path.join(
      materializedPath,
      "dataset-manifest.json",
    );
    try {
      await fs.access(manifestLocalPath);

      log.info("Cache hit", {
        event: "cache_hit",
        cacheKey,
        materializedPath,
        durationMs: Date.now() - startTime,
      });

      return { materializedPath, groupId };
    } catch {
      // Cache doesn't exist - proceed with materialization
      log.info("Cache miss", {
        event: "cache_miss",
        cacheKey,
      });
    }

    // Ensure the group's cache directory exists
    await fs.mkdir(groupCacheDir, { recursive: true });
    await fs.mkdir(materializedPath, { recursive: true });

    // Download all files from object storage
    const blobStorage = getGroupBlobStorage(groupId);

    log.info("Download start", {
      event: "download_start",
      storagePrefix: fullStoragePrefix,
    });

    try {
      const keys = await blobStorage.list(fullStoragePrefix);

      log.info("Files listed", {
        event: "files_listed",
        fileCount: keys.length,
      });

      // Download each file to the local cache directory
      for (const key of keys) {
        // Compute relative path by removing the full storage prefix
        const relativePath = key.startsWith(fullStoragePrefix + "/")
          ? key.slice(fullStoragePrefix.length + 1)
          : key.slice(fullStoragePrefix.length);

        if (!relativePath) continue;

        const localPath = path.join(materializedPath, relativePath);
        const localDir = path.dirname(localPath);

        await fs.mkdir(localDir, { recursive: true });

        const data = await blobStorage.read(key);
        // wx flag is exclusive creation. Will fail if already exists.
        // 0x600 permissions restrict to read/write only for the owner
        const fileHandle = await fs.open(localPath, "wx", 0o600);
        try {
          await fileHandle.writeFile(new Uint8Array(data));
        } finally {
          // Close to prevent file handler memory leaks.
          await fileHandle.close();
        }
      }

      log.info("Download complete", {
        event: "download_complete",
        fileCount: keys.length,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      log.error("Dataset download failed", {
        event: "download_failed",
        error: errorMessage,
      });

      // Clean up on failure
      await fs
        .rm(materializedPath, { recursive: true, force: true })
        .catch(() => {
          /* intentional: best-effort cleanup */
        });

      // A refusal of a key outside the dataset's group fails the same way on
      // every attempt, so it keeps its non-retryable failure.
      if (error instanceof ApplicationFailure) {
        throw error;
      }
      throw new Error(
        `Dataset download from object storage failed: ${errorMessage}`,
      );
    }

    const durationMs = Date.now() - startTime;
    log.info("Materialize dataset complete", {
      event: "complete",
      materializedPath,
      groupId,
      durationMs,
      alertType: "benchmark_materialize",
    });

    return { materializedPath, groupId };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);
    log.error("Materialize dataset error", {
      event: "error",
      error: errorMessage,
      durationMs: duration,
      stack: getErrorStack(error),
      alertType: "benchmark_materialize",
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Manifest Loading Activity
// ---------------------------------------------------------------------------

export type { DatasetManifest } from "../benchmark-types";

interface LoadManifestParams {
  materializedPath: string;
  datasetVersionId: string;
}

interface LoadManifestResult {
  manifest: DatasetManifest;
}

/**
 * Activity: Load dataset manifest from materialized dataset directory
 *
 * Reads and parses the manifest file from the materialized dataset,
 * using the manifestPath stored in the dataset version record.
 */
export async function loadDatasetManifest(
  params: LoadManifestParams,
): Promise<LoadManifestResult> {
  const activityName = "loadDatasetManifest";
  const { materializedPath, datasetVersionId } = params;
  const log = createActivityLogger(activityName, {
    materializedPath,
    datasetVersionId,
  });

  log.info("Load dataset manifest start", { event: "start" });

  try {
    // Look up the manifest path from the dataset version record
    const prisma = getPrismaClient();
    const datasetVersion = await prisma.datasetVersion.findUnique({
      where: { id: datasetVersionId },
      select: { manifestPath: true },
    });

    if (!datasetVersion) {
      throw new Error(`Dataset version not found: ${datasetVersionId}`);
    }

    const manifestPath = joinDatasetPath(
      materializedPath,
      datasetVersion.manifestPath,
    );
    const manifestContent = await fs.readFile(manifestPath, "utf-8");
    const manifest: DatasetManifest = JSON.parse(manifestContent);
    for (const sample of manifest.samples) {
      if (!isSafeSampleId(sample.id)) {
        throw new Error(
          `Dataset manifest has an invalid sample id: ${JSON.stringify(sample.id)}`,
        );
      }
    }

    log.info("Load dataset manifest complete", {
      event: "complete",
      sampleCount: manifest.samples.length,
      hasSplits: !!manifest.splits,
    });

    return { manifest };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    log.error("Load dataset manifest error", {
      event: "error",
      error: errorMessage,
    });
    throw new Error(`Failed to load manifest: ${errorMessage}`);
  }
}
