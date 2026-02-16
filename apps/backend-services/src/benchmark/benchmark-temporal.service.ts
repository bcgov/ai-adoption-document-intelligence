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
import { Client, Connection, ScheduleClient } from "@temporalio/client";
import { WORKFLOW_TYPES } from "../temporal/workflow-types";
import type { ScheduleInfoDto } from "./dto";

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
   * Create a Temporal schedule for automatic benchmark runs
   *
   * @param definitionId The benchmark definition ID
   * @param cron The cron expression for the schedule
   * @param benchmarkDefinition The benchmark configuration
   * @returns The schedule ID
   */
  async createSchedule(
    definitionId: string,
    cron: string,
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

    const scheduleId = `benchmark-schedule-${definitionId}`;

    try {
      this.logger.log(
        `Creating schedule for definition ${definitionId} with cron: ${cron}`,
      );

      const scheduleClient = new ScheduleClient({
        connection: this.connection!,
      });

      await scheduleClient.create({
        scheduleId,
        spec: {
          cronExpressions: [cron],
        },
        action: {
          type: "startWorkflow",
          workflowType: WORKFLOW_TYPES.BENCHMARK_RUN_WORKFLOW,
          args: [
            {
              runId: "{{.ScheduledTime}}-{{.ScheduleId}}", // Temporal template for unique run ID
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
          workflowExecutionTimeout: "24 hours",
        },
        memo: {
          definitionId,
          evaluatorType: benchmarkDefinition.evaluatorType,
          source: "scheduled",
        },
      });

      this.logger.log(`Schedule created: ${scheduleId}`);
      return scheduleId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create schedule: ${errorMessage}`);
      throw new Error(`Failed to create schedule: ${errorMessage}`);
    }
  }

  /**
   * Delete a Temporal schedule
   *
   * @param scheduleId The schedule ID to delete
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.ensureClient();

    try {
      this.logger.log(`Deleting schedule: ${scheduleId}`);

      const scheduleClient = new ScheduleClient({
        connection: this.connection!,
      });
      const handle = scheduleClient.getHandle(scheduleId);
      await handle.delete();

      this.logger.log(`Schedule deleted: ${scheduleId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete schedule: ${errorMessage}`);
      throw new Error(`Failed to delete schedule: ${errorMessage}`);
    }
  }

  /**
   * Get schedule information
   *
   * @param scheduleId The schedule ID to query
   * @returns Schedule information
   */
  async getScheduleInfo(scheduleId: string): Promise<ScheduleInfoDto> {
    await this.ensureClient();

    try {
      const scheduleClient = new ScheduleClient({
        connection: this.connection!,
      });
      const handle = scheduleClient.getHandle(scheduleId);
      const description = await handle.describe();

      // Access nested properties safely with type assertions
      const spec = (
        description as unknown as {
          spec?: { calendars?: { cronString?: string }[] };
        }
      ).spec;
      const info = (
        description as unknown as {
          info?: {
            nextActionTimes?: Date[];
            recentActions?: { scheduledAt?: Date }[];
          };
        }
      ).info;
      const state = (description as unknown as { state?: { paused?: boolean } })
        .state;

      // Try to extract cron from different possible locations
      let cron = "";
      if (spec?.calendars?.[0]?.cronString) {
        cron = spec.calendars[0].cronString;
      }

      return {
        scheduleId,
        cron,
        nextRunTime: info?.nextActionTimes?.[0],
        lastRunTime: info?.recentActions?.[0]?.scheduledAt,
        paused: state?.paused || false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get schedule info: ${errorMessage}`);
      throw new Error(`Failed to get schedule info: ${errorMessage}`);
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
