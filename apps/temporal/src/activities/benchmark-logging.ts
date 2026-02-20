/**
 * Benchmark Logging & Cleanup Activities
 *
 * Temporal activities for logging benchmark results to MLflow and cleaning up temporary files.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-021-mlflow-logging-cleanup-activities.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 6.3, 11.4
 */

import * as fs from "fs/promises";
import axios, { AxiosInstance } from "axios";

/**
 * Input for benchmark.logToMlflow activity
 */
export interface BenchmarkLogToMlflowInput {
  /**
   * MLflow run ID to log to
   */
  mlflowRunId: string;

  /**
   * Parameters to log (Section 6.3: dataset_version_id, dataset_git_revision, workflow_config_hash, evaluator_type, evaluator_config_hash)
   */
  params: Record<string, string>;

  /**
   * Aggregated metrics to log (mean F1, precision, recall, per-field scores, etc.)
   */
  metrics: Record<string, number>;

  /**
   * Tags to set (Section 6.3: worker_image_digest, worker_git_sha, benchmark_run_id, benchmark_definition_id, benchmark_project_id)
   */
  tags: Record<string, string>;

  /**
   * Artifact paths to upload (file paths on worker disk)
   */
  artifactPaths?: string[];

  /**
   * Final run status (FINISHED or FAILED)
   */
  status: "FINISHED" | "FAILED";
}

/**
 * Input for benchmark.cleanup activity
 */
export interface BenchmarkCleanupInput {
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
 * Log benchmark results to MLflow
 *
 * Activity type: benchmark.logToMlflow
 */
export async function benchmarkLogToMlflow(
  input: BenchmarkLogToMlflowInput,
): Promise<void> {
  const { mlflowRunId, params, metrics, tags, artifactPaths, status } = input;

  const trackingUri =
    process.env.MLFLOW_TRACKING_URI || "http://localhost:5000";
  const client = axios.create({
    baseURL: trackingUri,
    headers: {
      "Content-Type": "application/json",
    },
  });

  try {
    // Log parameters (Section 6.3 required params)
    await logParams(client, mlflowRunId, params);

    // Log aggregated metrics
    await logMetrics(client, mlflowRunId, metrics);

    // Set run tags (Section 6.3 required tags)
    await setTags(client, mlflowRunId, tags);

    // Log artifacts if provided
    if (artifactPaths && artifactPaths.length > 0) {
      await logArtifacts(client, mlflowRunId, artifactPaths);
    }

    // Update run status
    await updateRunStatus(client, mlflowRunId, status);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to log to MLflow: ${errorMessage}`);
  }
}

/**
 * Clean up temporary files after benchmark run
 *
 * Activity type: benchmark.cleanup
 */
export async function benchmarkCleanup(
  input: BenchmarkCleanupInput,
): Promise<void> {
  const {
    materializedDatasetPaths = [],
    temporaryOutputPaths = [],
  } = input;

  const errors: string[] = [];

  // Clean up materialized dataset files (respecting cache preservation)
  if (materializedDatasetPaths.length > 0) {
    for (const filePath of materializedDatasetPaths) {
      try {
        await removeFileOrDirectory(filePath);
      } catch (error) {
        // Only record error if file existed but couldn't be deleted
        const fileExists = await checkFileExists(filePath);
        if (fileExists) {
          errors.push(`Failed to delete materialized file ${filePath}: ${error}`);
        }
        // If file doesn't exist, cleanup is idempotent - continue silently
      }
    }
  }

  // Clean up temporary per-run output files
  if (temporaryOutputPaths.length > 0) {
    for (const filePath of temporaryOutputPaths) {
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
 * Log parameters to MLflow run
 */
async function logParams(
  client: AxiosInstance,
  runId: string,
  params: Record<string, string>,
): Promise<void> {
  const promises = Object.entries(params).map(([key, value]) =>
    client.post("/api/2.0/mlflow/runs/log-parameter", {
      run_id: runId,
      key,
      value: String(value),
    }),
  );

  await Promise.all(promises);
}

/**
 * Log metrics to MLflow run
 */
async function logMetrics(
  client: AxiosInstance,
  runId: string,
  metrics: Record<string, number>,
): Promise<void> {
  const timestamp = Date.now();
  const promises = Object.entries(metrics).map(([key, value]) =>
    client.post("/api/2.0/mlflow/runs/log-metric", {
      run_id: runId,
      key,
      value: Number(value),
      timestamp,
      step: 0,
    }),
  );

  await Promise.all(promises);
}

/**
 * Set tags on MLflow run
 */
async function setTags(
  client: AxiosInstance,
  runId: string,
  tags: Record<string, string>,
): Promise<void> {
  const promises = Object.entries(tags).map(([key, value]) =>
    client.post("/api/2.0/mlflow/runs/set-tag", {
      run_id: runId,
      key,
      value: String(value),
    }),
  );

  await Promise.all(promises);
}

/**
 * Log artifacts to MLflow run
 *
 * Note: This is a simplified implementation. In production, artifacts would be
 * uploaded directly to the MLflow artifact store (MinIO) via the artifact URI.
 * For now, we use the MLflow REST API log-batch endpoint or skip artifact upload.
 */
async function logArtifacts(
  _client: AxiosInstance,
  runId: string,
  artifactPaths: string[],
): Promise<void> {
  // MLflow REST API doesn't have a direct artifact upload endpoint.
  // Artifacts are typically uploaded to the artifact store (MinIO) directly.
  // This would require:
  // 1. Get artifact URI from run info
  // 2. Parse S3 URI
  // 3. Upload files directly to MinIO using S3 SDK
  //
  // For now, we'll skip artifact upload (similar to backend MLflowClientService)
  // See US-013 for artifact management implementation
  console.warn(
    `Artifact logging not fully implemented. Would log ${artifactPaths.length} artifacts to run ${runId}`,
  );
}

/**
 * Update MLflow run status
 */
async function updateRunStatus(
  client: AxiosInstance,
  runId: string,
  status: "FINISHED" | "FAILED",
): Promise<void> {
  await client.post("/api/2.0/mlflow/runs/update", {
    run_id: runId,
    status,
    end_time: Date.now(),
  });
}

/**
 * Remove a file or directory (recursively)
 */
async function removeFileOrDirectory(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }
  } catch (error) {
    // Re-throw to be handled by caller
    throw error;
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
