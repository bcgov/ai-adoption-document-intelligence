/**
 * Benchmark Temporal Service
 *
 * Handles Temporal workflow operations specific to benchmarking.
 * Wraps TemporalClientService with benchmark-specific logic.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 4.2
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, Connection } from "@temporalio/client";
import { WORKFLOW_TYPES } from "../temporal/workflow-types";

/**
 * Service for managing benchmark Temporal workflows
 */
@Injectable()
export class BenchmarkTemporalService {
  private readonly logger = new Logger(BenchmarkTemporalService.name);
  private connection: Connection | null = null;
  private client: Client | null = null;
  private readonly address: string;
  private readonly namespace: string;
  private readonly taskQueue: string;

  constructor(private configService: ConfigService) {
    this.address =
      this.configService.get<string>("TEMPORAL_ADDRESS") || "localhost:7233";
    this.namespace =
      this.configService.get<string>("TEMPORAL_NAMESPACE") || "default";
    this.taskQueue =
      this.configService.get<string>("BENCHMARK_TASK_QUEUE") ||
      "benchmark-processing";
  }

  /**
   * Initialize the Temporal connection and client
   */
  private async ensureClient(): Promise<void> {
    if (this.client) {
      return;
    }

    try {
      this.logger.log(
        `Connecting to Temporal at ${this.address} (namespace: ${this.namespace})`,
      );
      this.connection = await Connection.connect({
        address: this.address,
      });

      this.client = new Client({
        connection: this.connection,
        namespace: this.namespace,
      });

      this.logger.log("Temporal client connected successfully");
    } catch (error) {
      this.logger.error(
        `Failed to connect to Temporal: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Start a benchmark run workflow
   *
   * @param runId Unique run ID (used as workflow ID)
   * @param benchmarkDefinition The benchmark definition configuration
   * @returns The workflow ID
   */
  async startBenchmarkRunWorkflow(
    runId: string,
    benchmarkDefinition: {
      definitionId: string;
      datasetVersionId: string;
      splitId: string;
      workflowId: string;
      workflowConfigHash: string;
      evaluatorType: string;
      evaluatorConfig: Record<string, unknown>;
      runtimeSettings: Record<string, unknown>;
      artifactPolicy: Record<string, unknown>;
    },
  ): Promise<string> {
    await this.ensureClient();

    const workflowId = `benchmark-run-${runId}`;

    try {
      this.logger.log(
        `Starting benchmark run workflow: ${workflowId} for definition ${benchmarkDefinition.definitionId}`,
      );

      const handle = await this.client!.workflow.start(
        WORKFLOW_TYPES.BENCHMARK_RUN_WORKFLOW,
        {
          args: [
            {
              runId,
              definitionId: benchmarkDefinition.definitionId,
              datasetVersionId: benchmarkDefinition.datasetVersionId,
              splitId: benchmarkDefinition.splitId,
              workflowId: benchmarkDefinition.workflowId,
              workflowConfigHash: benchmarkDefinition.workflowConfigHash,
              evaluatorType: benchmarkDefinition.evaluatorType,
              evaluatorConfig: benchmarkDefinition.evaluatorConfig,
              runtimeSettings: benchmarkDefinition.runtimeSettings,
              artifactPolicy: benchmarkDefinition.artifactPolicy,
            },
          ],
          taskQueue: this.taskQueue,
          workflowId,
          workflowExecutionTimeout: "24 hours",
          memo: {
            runId,
            definitionId: benchmarkDefinition.definitionId,
            evaluatorType: benchmarkDefinition.evaluatorType,
          },
        },
      );

      this.logger.log(
        `Benchmark run workflow started: ${handle.workflowId} for run ${runId}`,
      );
      return handle.workflowId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to start benchmark run workflow: ${errorMessage}`,
      );
      throw new Error(
        `Failed to start benchmark run workflow: ${errorMessage}`,
      );
    }
  }

  /**
   * Cancel a running benchmark workflow
   *
   * @param workflowId The workflow ID to cancel
   */
  async cancelBenchmarkRunWorkflow(workflowId: string): Promise<void> {
    await this.ensureClient();

    try {
      this.logger.log(`Canceling benchmark run workflow: ${workflowId}`);

      const handle = this.client!.workflow.getHandle(workflowId);
      await handle.cancel();

      this.logger.log(`Benchmark run workflow cancelled: ${workflowId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to cancel benchmark run workflow: ${errorMessage}`,
      );
      throw new Error(
        `Failed to cancel benchmark run workflow: ${errorMessage}`,
      );
    }
  }

  /**
   * Get the status of a benchmark workflow
   *
   * @param workflowId The workflow ID to query
   * @returns Workflow status information
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    status: string;
    result?: unknown;
  }> {
    await this.ensureClient();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      const description = await handle.describe();

      return {
        status: description.status.name,
        result:
          description.status.name === "COMPLETED"
            ? await handle.result()
            : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get workflow status: ${errorMessage}`);
      throw new Error(`Failed to get workflow status: ${errorMessage}`);
    }
  }

  /**
   * Close the Temporal connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.logger.log("Temporal connection closed");
    }
  }
}
