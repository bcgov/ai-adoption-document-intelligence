/**
 * MLflow Client Service
 *
 * Wraps the MLflow REST API for experiment tracking and artifact logging.
 * Provides methods to create experiments and runs, log params/metrics/tags/artifacts,
 * update run status, and query experiment data.
 *
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 6
 */

import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

export interface MLflowExperiment {
  experiment_id: string;
  name: string;
}

export interface MLflowRun {
  run_id: string;
  experiment_id: string;
  status: string;
  start_time?: number;
  end_time?: number;
}

export interface MLflowRunInfo {
  run_id: string;
  experiment_id: string;
  status: string;
  start_time: number;
  end_time?: number;
  artifact_uri: string;
  lifecycle_stage: string;
}

export interface MLflowRunData {
  metrics: Record<string, number>;
  params: Record<string, string>;
  tags: Record<string, string>;
}

export interface MLflowRunDetails {
  info: MLflowRunInfo;
  data: MLflowRunData;
}

export enum MLflowRunStatus {
  RUNNING = "RUNNING",
  FINISHED = "FINISHED",
  FAILED = "FAILED",
  KILLED = "KILLED",
}

@Injectable()
export class MLflowClientService {
  private readonly logger = new Logger(MLflowClientService.name);
  private readonly trackingUri: string;

  constructor(
    private readonly httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.trackingUri = this.configService.get<string>(
      "MLFLOW_TRACKING_URI",
      "http://localhost:5000",
    );
    this.logger.log(`MLflow client initialized: trackingUri=${this.trackingUri}`);
  }

  /**
   * Create an MLflow experiment.
   */
  async createExperiment(name: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ experiment_id: string }>(
          `${this.trackingUri}/api/2.0/mlflow/experiments/create`,
          { name },
        ),
      );

      this.logger.log(`Created MLflow experiment: ${name} (ID: ${response.data.experiment_id})`);
      return response.data.experiment_id;
    } catch (error) {
      this.logger.error(`Failed to create MLflow experiment: ${name}`, error.stack);
      throw new Error(`Failed to create MLflow experiment "${name}": ${error.message}`);
    }
  }

  /**
   * Create an MLflow run within an experiment.
   */
  async createRun(experimentId: string, runName?: string): Promise<string> {
    try {
      const requestBody: {
        experiment_id: string;
        tags?: Array<{ key: string; value: string }>;
      } = {
        experiment_id: experimentId,
      };

      if (runName) {
        requestBody.tags = [{ key: "mlflow.runName", value: runName }];
      }

      const response = await firstValueFrom(
        this.httpService.post<{ run: { info: { run_id: string } } }>(
          `${this.trackingUri}/api/2.0/mlflow/runs/create`,
          requestBody,
        ),
      );

      const runId = response.data.run.info.run_id;
      this.logger.log(`Created MLflow run: ${runName || "unnamed"} (ID: ${runId})`);
      return runId;
    } catch (error) {
      this.logger.error(
        `Failed to create MLflow run in experiment ${experimentId}`,
        error.stack,
      );
      throw new Error(`Failed to create MLflow run: ${error.message}`);
    }
  }

  /**
   * Log parameters to an MLflow run.
   */
  async logParams(runId: string, params: Record<string, string>): Promise<void> {
    try {
      const promises = Object.entries(params).map(([key, value]) =>
        firstValueFrom(
          this.httpService.post(
            `${this.trackingUri}/api/2.0/mlflow/runs/log-parameter`,
            {
              run_id: runId,
              key,
              value: String(value),
            },
          ),
        ),
      );

      await Promise.all(promises);
      this.logger.debug(`Logged ${Object.keys(params).length} parameters to run ${runId}`);
    } catch (error) {
      this.logger.error(`Failed to log parameters to run ${runId}`, error.stack);
      throw new Error(`Failed to log parameters: ${error.message}`);
    }
  }

  /**
   * Log metrics to an MLflow run.
   */
  async logMetrics(runId: string, metrics: Record<string, number>): Promise<void> {
    try {
      const timestamp = Date.now();
      const promises = Object.entries(metrics).map(([key, value]) =>
        firstValueFrom(
          this.httpService.post(
            `${this.trackingUri}/api/2.0/mlflow/runs/log-metric`,
            {
              run_id: runId,
              key,
              value: Number(value),
              timestamp,
              step: 0,
            },
          ),
        ),
      );

      await Promise.all(promises);
      this.logger.debug(`Logged ${Object.keys(metrics).length} metrics to run ${runId}`);
    } catch (error) {
      this.logger.error(`Failed to log metrics to run ${runId}`, error.stack);
      throw new Error(`Failed to log metrics: ${error.message}`);
    }
  }

  /**
   * Set tags on an MLflow run.
   */
  async setTags(runId: string, tags: Record<string, string>): Promise<void> {
    try {
      const promises = Object.entries(tags).map(([key, value]) =>
        firstValueFrom(
          this.httpService.post(`${this.trackingUri}/api/2.0/mlflow/runs/set-tag`, {
            run_id: runId,
            key,
            value: String(value),
          }),
        ),
      );

      await Promise.all(promises);
      this.logger.debug(`Set ${Object.keys(tags).length} tags on run ${runId}`);
    } catch (error) {
      this.logger.error(`Failed to set tags on run ${runId}`, error.stack);
      throw new Error(`Failed to set tags: ${error.message}`);
    }
  }

  /**
   * Log an artifact to an MLflow run.
   */
  async logArtifact(
    runId: string,
    artifactPath: string,
    content: Buffer,
  ): Promise<void> {
    try {
      // MLflow REST API doesn't have a direct artifact upload endpoint
      // Artifacts are typically uploaded to the artifact store (MinIO) directly
      // For now, we'll use the log-batch endpoint or implement direct MinIO upload
      // This is a simplified implementation - actual artifact logging may require
      // direct MinIO integration or using MLflow's Python client

      this.logger.warn(
        `Artifact logging not fully implemented. Would log artifact: ${artifactPath} (${content.length} bytes) to run ${runId}`,
      );

      // TODO: Implement artifact upload via direct MinIO integration
      // See US-013 for artifact management implementation
    } catch (error) {
      this.logger.error(
        `Failed to log artifact ${artifactPath} to run ${runId}`,
        error.stack,
      );
      throw new Error(`Failed to log artifact: ${error.message}`);
    }
  }

  /**
   * Update the status of an MLflow run.
   */
  async updateRunStatus(runId: string, status: MLflowRunStatus): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(`${this.trackingUri}/api/2.0/mlflow/runs/update`, {
          run_id: runId,
          status,
          end_time: status !== MLflowRunStatus.RUNNING ? Date.now() : undefined,
        }),
      );

      this.logger.log(`Updated run ${runId} status to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to update run ${runId} status to ${status}`,
        error.stack,
      );
      throw new Error(`Failed to update run status: ${error.message}`);
    }
  }

  /**
   * Query runs for an experiment.
   */
  async queryRuns(
    experimentId: string,
    filter?: string,
  ): Promise<MLflowRunDetails[]> {
    try {
      const requestBody: {
        experiment_ids: string[];
        filter?: string;
      } = {
        experiment_ids: [experimentId],
      };

      if (filter) {
        requestBody.filter = filter;
      }

      const response = await firstValueFrom(
        this.httpService.post<{ runs: MLflowRunDetails[] }>(
          `${this.trackingUri}/api/2.0/mlflow/runs/search`,
          requestBody,
        ),
      );

      const runs = response.data.runs || [];
      this.logger.debug(
        `Queried ${runs.length} runs for experiment ${experimentId}`,
      );
      return runs;
    } catch (error) {
      this.logger.error(
        `Failed to query runs for experiment ${experimentId}`,
        error.stack,
      );
      throw new Error(`Failed to query runs: ${error.message}`);
    }
  }
}
