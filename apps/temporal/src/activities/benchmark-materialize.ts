import * as fs from 'fs/promises';
import * as path from 'path';
import { getPrismaClient } from './database-client';
import { getBlobStorageClient } from '../blob-storage/blob-storage-client';
import type { DatasetManifest } from '../benchmark-types';

interface MaterializeDatasetParams {
  datasetVersionId: string;
}

interface MaterializeDatasetResult {
  materializedPath: string;
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
  params: MaterializeDatasetParams
): Promise<MaterializeDatasetResult> {
  const activityName = 'materializeDataset';
  const startTime = Date.now();
  const { datasetVersionId } = params;

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    datasetVersionId,
    timestamp: new Date().toISOString()
  }));

  try {
    const prisma = getPrismaClient();

    // Fetch dataset version and parent dataset details
    const datasetVersion = await prisma.datasetVersion.findUnique({
      where: { id: datasetVersionId },
      include: { dataset: true }
    });

    if (!datasetVersion) {
      throw new Error(`Dataset version not found: ${datasetVersionId}`);
    }

    const { dataset, storagePrefix } = datasetVersion;
    const { id: datasetId } = dataset;

    if (!storagePrefix) {
      throw new Error(`Dataset version ${datasetVersionId} has no storage prefix (no files uploaded)`);
    }

    // Determine cache directory
    const cacheBaseDir = process.env.BENCHMARK_CACHE_DIR || '/tmp/benchmark-cache';
    const cacheKey = `${datasetId}-${datasetVersionId}`;
    const materializedPath = path.join(cacheBaseDir, cacheKey);

    console.log(JSON.stringify({
      activity: activityName,
      event: 'check_cache',
      cacheKey,
      materializedPath,
      timestamp: new Date().toISOString()
    }));

    // Check if dataset is already cached by looking for the manifest
    const manifestLocalPath = path.join(materializedPath, 'dataset-manifest.json');
    try {
      await fs.access(manifestLocalPath);

      console.log(JSON.stringify({
        activity: activityName,
        event: 'cache_hit',
        cacheKey,
        materializedPath,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }));

      return { materializedPath };
    } catch {
      // Cache doesn't exist - proceed with materialization
      console.log(JSON.stringify({
        activity: activityName,
        event: 'cache_miss',
        cacheKey,
        timestamp: new Date().toISOString()
      }));
    }

    // Ensure cache base directory exists
    await fs.mkdir(cacheBaseDir, { recursive: true });
    await fs.mkdir(materializedPath, { recursive: true });

    // Download all files from object storage
    const blobStorage = getBlobStorageClient();

    console.log(JSON.stringify({
      activity: activityName,
      event: 'download_start',
      storagePrefix,
      timestamp: new Date().toISOString()
    }));

    try {
      const keys = await blobStorage.list(storagePrefix);

      console.log(JSON.stringify({
        activity: activityName,
        event: 'files_listed',
        fileCount: keys.length,
        timestamp: new Date().toISOString()
      }));

      // Download each file to the local cache directory
      for (const key of keys) {
        // Compute relative path by removing the storage prefix
        const relativePath = key.startsWith(storagePrefix + '/')
          ? key.slice(storagePrefix.length + 1)
          : key.slice(storagePrefix.length);

        if (!relativePath) continue;

        const localPath = path.join(materializedPath, relativePath);
        const localDir = path.dirname(localPath);

        await fs.mkdir(localDir, { recursive: true });

        const data = await blobStorage.read(key);
        await fs.writeFile(localPath, data);
      }

      console.log(JSON.stringify({
        activity: activityName,
        event: 'download_complete',
        fileCount: keys.length,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({
        activity: activityName,
        event: 'download_failed',
        error: errorMessage,
        timestamp: new Date().toISOString()
      }));

      // Clean up on failure
      await fs.rm(materializedPath, { recursive: true, force: true }).catch(() => {});

      throw new Error(`Dataset download from object storage failed: ${errorMessage}`);
    }

    const durationMs = Date.now() - startTime;
    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      datasetVersionId,
      materializedPath,
      durationMs,
      timestamp: new Date().toISOString()
    }));

    return { materializedPath };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      datasetVersionId,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Manifest Loading Activity
// ---------------------------------------------------------------------------

export type { DatasetManifest } from '../benchmark-types';

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
  params: LoadManifestParams
): Promise<LoadManifestResult> {
  const activityName = 'loadDatasetManifest';
  const { materializedPath, datasetVersionId } = params;

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    materializedPath,
    timestamp: new Date().toISOString()
  }));

  try {
    // Look up the manifest path from the dataset version record
    const prisma = getPrismaClient();
    const datasetVersion = await prisma.datasetVersion.findUnique({
      where: { id: datasetVersionId },
      select: { manifestPath: true }
    });

    if (!datasetVersion) {
      throw new Error(`Dataset version not found: ${datasetVersionId}`);
    }

    const manifestPath = path.join(materializedPath, datasetVersion.manifestPath);
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest: DatasetManifest = JSON.parse(manifestContent);

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      sampleCount: manifest.samples.length,
      hasSplits: !!manifest.splits,
      timestamp: new Date().toISOString()
    }));

    return { manifest };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      materializedPath,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }));
    throw new Error(`Failed to load manifest: ${errorMessage}`);
  }
}
