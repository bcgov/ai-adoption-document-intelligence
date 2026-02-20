import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getPrismaClient } from './database-client';

const execAsync = promisify(exec);

interface MaterializeDatasetParams {
  datasetVersionId: string;
}

interface MaterializeDatasetResult {
  materializedPath: string;
}

/**
 * Activity: Materialize a pinned dataset version on the worker
 *
 * Clones the dataset Git repository, checks out the specific gitRevision,
 * configures DVC remote to MinIO, and runs `dvc pull` to fetch data files.
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

    const { dataset, gitRevision } = datasetVersion;
    const { id: datasetId, repositoryUrl } = dataset;

    // Determine cache directory
    const cacheBaseDir = process.env.BENCHMARK_CACHE_DIR || '/tmp/benchmark-cache';
    const cacheKey = `${datasetId}-${gitRevision}`;
    const materializedPath = path.join(cacheBaseDir, cacheKey);

    console.log(JSON.stringify({
      activity: activityName,
      event: 'check_cache',
      cacheKey,
      materializedPath,
      timestamp: new Date().toISOString()
    }));

    // Check if dataset is already cached
    try {
      await fs.access(materializedPath);

      // Verify that the cached directory has the correct git revision
      const { stdout: cachedRevision } = await execAsync('git rev-parse HEAD', {
        cwd: materializedPath
      });

      if (cachedRevision.trim() === gitRevision) {
        console.log(JSON.stringify({
          activity: activityName,
          event: 'cache_hit',
          cacheKey,
          materializedPath,
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }));

        return { materializedPath };
      } else {
        // Cache exists but revision mismatch - clean up old cache
        console.log(JSON.stringify({
          activity: activityName,
          event: 'cache_invalidation',
          cacheKey,
          expectedRevision: gitRevision,
          foundRevision: cachedRevision.trim(),
          timestamp: new Date().toISOString()
        }));

        await fs.rm(materializedPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Cache doesn't exist or is inaccessible - proceed with materialization
      console.log(JSON.stringify({
        activity: activityName,
        event: 'cache_miss',
        cacheKey,
        timestamp: new Date().toISOString()
      }));
    }

    // Ensure cache base directory exists
    await fs.mkdir(cacheBaseDir, { recursive: true });

    // Clone repository
    console.log(JSON.stringify({
      activity: activityName,
      event: 'git_clone_start',
      repositoryUrl,
      targetPath: materializedPath,
      timestamp: new Date().toISOString()
    }));

    try {
      // Get Git credentials from environment if available
      const gitUsername = process.env.DATASET_GIT_USERNAME;
      const gitPassword = process.env.DATASET_GIT_PASSWORD;

      let cloneUrl = repositoryUrl;
      if (gitUsername && gitPassword && repositoryUrl.startsWith('http')) {
        const url = new URL(repositoryUrl);
        url.username = gitUsername;
        url.password = gitPassword;
        cloneUrl = url.toString();
      }

      const { stderr: cloneStderr } = await execAsync(
        `git clone "${cloneUrl}" "${materializedPath}"`
      );

      if (cloneStderr && !cloneStderr.includes('Cloning into')) {
        console.log(JSON.stringify({
          activity: activityName,
          event: 'git_clone_warning',
          stderr: cloneStderr,
          timestamp: new Date().toISOString()
        }));
      }

      console.log(JSON.stringify({
        activity: activityName,
        event: 'git_clone_complete',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({
        activity: activityName,
        event: 'git_clone_failed',
        error: errorMessage,
        timestamp: new Date().toISOString()
      }));

      // Clean up on failure
      await fs.rm(materializedPath, { recursive: true, force: true }).catch(() => {});

      throw new Error(`Git clone failed: ${errorMessage}`);
    }

    // Checkout specific revision
    console.log(JSON.stringify({
      activity: activityName,
      event: 'git_checkout_start',
      gitRevision,
      timestamp: new Date().toISOString()
    }));

    try {
      await execAsync(`git checkout ${gitRevision}`, { cwd: materializedPath });

      console.log(JSON.stringify({
        activity: activityName,
        event: 'git_checkout_complete',
        gitRevision,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({
        activity: activityName,
        event: 'git_checkout_failed',
        gitRevision,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }));

      // Clean up on failure
      await fs.rm(materializedPath, { recursive: true, force: true }).catch(() => {});

      throw new Error(`Git checkout failed: ${errorMessage}`);
    }

    // Configure DVC remote for MinIO
    console.log(JSON.stringify({
      activity: activityName,
      event: 'dvc_configure_start',
      timestamp: new Date().toISOString()
    }));

    try {
      const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
      const minioAccessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
      const minioSecretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
      const remoteName = 'minio';

      // Configure DVC remote to use MinIO
      // Check if remote already exists in the repo
      let remoteExists = false;
      try {
        await execAsync(`dvc remote list`, { cwd: materializedPath });
        remoteExists = true;
      } catch {
        remoteExists = false;
      }

      if (!remoteExists) {
        await execAsync(`dvc remote add -d ${remoteName} s3://datasets`, {
          cwd: materializedPath
        });
      }

      // Configure remote settings
      await execAsync(
        `dvc remote modify ${remoteName} endpointurl ${minioEndpoint}`,
        { cwd: materializedPath }
      );

      await execAsync(
        `dvc remote modify ${remoteName} access_key_id ${minioAccessKey}`,
        { cwd: materializedPath }
      );

      await execAsync(
        `dvc remote modify ${remoteName} secret_access_key ${minioSecretKey}`,
        { cwd: materializedPath }
      );

      console.log(JSON.stringify({
        activity: activityName,
        event: 'dvc_configure_complete',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(JSON.stringify({
        activity: activityName,
        event: 'dvc_configure_warning',
        error: errorMessage,
        timestamp: new Date().toISOString()
      }));
      // Continue even if DVC configure fails - the repo might already have correct settings
    }

    // Pull DVC data from MinIO
    console.log(JSON.stringify({
      activity: activityName,
      event: 'dvc_pull_start',
      timestamp: new Date().toISOString()
    }));

    try {
      const { stderr: pullStderr } = await execAsync('dvc pull', {
        cwd: materializedPath
      });

      if (pullStderr && !pullStderr.includes('files downloaded')) {
        console.log(JSON.stringify({
          activity: activityName,
          event: 'dvc_pull_warning',
          stderr: pullStderr,
          timestamp: new Date().toISOString()
        }));
      }

      console.log(JSON.stringify({
        activity: activityName,
        event: 'dvc_pull_complete',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({
        activity: activityName,
        event: 'dvc_pull_failed',
        error: errorMessage,
        timestamp: new Date().toISOString()
      }));

      // Clean up on failure
      await fs.rm(materializedPath, { recursive: true, force: true }).catch(() => {});

      throw new Error(`DVC pull failed: ${errorMessage}`);
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

export interface DatasetManifest {
  schemaVersion: string;
  samples: Array<{
    id: string;
    inputs: Array<{ path: string; mimeType: string }>;
    groundTruth: Array<{ path: string; format: string }>;
    metadata: Record<string, unknown>;
  }>;
  splits?: {
    train?: string[];
    validation?: string[];
    test?: string[];
    [splitName: string]: string[] | undefined;
  };
}

interface LoadManifestParams {
  materializedPath: string;
}

interface LoadManifestResult {
  manifest: DatasetManifest;
}

/**
 * Activity: Load dataset manifest from materialized dataset directory
 *
 * Reads and parses the manifest.json file from the materialized dataset.
 */
export async function loadDatasetManifest(
  params: LoadManifestParams
): Promise<LoadManifestResult> {
  const activityName = 'loadDatasetManifest';
  const { materializedPath } = params;

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    materializedPath,
    timestamp: new Date().toISOString()
  }));

  try {
    const manifestPath = path.join(materializedPath, 'manifest.json');
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
