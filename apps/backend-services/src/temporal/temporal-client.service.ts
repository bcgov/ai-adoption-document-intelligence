import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, Connection } from "@temporalio/client";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";
import { computeConfigHash } from "../workflow/config-hash";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";
import { WorkflowService } from "../workflow/workflow.service";
import { WORKFLOW_TYPES } from "./workflow-types";

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private connection: Connection | null = null;
  private client: Client | null = null;
  private readonly address: string;
  private readonly namespace: string;
  private readonly taskQueue: string;

  // INDEXED_VALUE_TYPE_KEYWORD = 2 (temporal.api.enums.v1.IndexedValueType)
  private static readonly KEYWORD = 2;

  private static readonly SEARCH_ATTRIBUTES: readonly { name: string }[] = [
    { name: "DocumentId" },
    { name: "FileName" },
    { name: "FileType" },
    { name: "Status" },
  ] as const;

  /**
   * Ensures the Temporal client is initialized
   * @throws Error if client is not initialized
   */
  private ensureClientInitialized(): void {
    if (!this.client) {
      throw new Error("Temporal client not initialized");
    }
  }

  /**
   * Handles errors with consistent logging and error enhancement
   * @param error The error to handle
   * @param context Context for the error (e.g., "start OCR workflow")
   * @returns Enhanced error with helpful message
   */
  private handleError(error: unknown, context: string): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Build helpful error message based on error type
    let enhancedMessage = `Failed to ${context}: ${errorMessage}`;

    // Check for common Temporal error patterns
    const messageLower = errorMessage.toLowerCase();
    if (
      messageLower.includes("not found") ||
      messageLower.includes("unknown workflow type") ||
      messageLower.includes("no such function")
    ) {
      enhancedMessage += `. The Temporal worker may not be running or the workflow type is not registered. Ensure the worker is running and listening on task queue "${this.taskQueue}".`;
    } else if (
      messageLower.includes("connection") ||
      messageLower.includes("econnrefused") ||
      messageLower.includes("unavailable")
    ) {
      enhancedMessage += `. Cannot connect to Temporal server at ${this.address}. Ensure the Temporal server is running.`;
    } else if (
      messageLower.includes("deadline exceeded") ||
      messageLower.includes("timeout")
    ) {
      enhancedMessage += `. Connection to Temporal server timed out. Check network connectivity.`;
    } else if (
      messageLower.includes("no mapping defined for search attribute")
    ) {
      enhancedMessage += `. The backend registers required search attributes on startup. If this error persists, check backend startup logs and Temporal connectivity.`;
    }

    this.logger.error(enhancedMessage);
    if (errorStack) {
      this.logger.debug(`Stack trace: ${errorStack}`);
    }

    const enhancedError = new Error(enhancedMessage);
    if (errorStack) {
      enhancedError.stack = errorStack;
    }
    return enhancedError;
  }

  constructor(
    private configService: ConfigService,
    private workflowService: WorkflowService,
    private readonly logger: AppLoggerService,
  ) {
    this.address =
      this.configService.get<string>("TEMPORAL_ADDRESS") || "localhost:7233";
    this.namespace =
      this.configService.get<string>("TEMPORAL_NAMESPACE") || "default";
    this.taskQueue =
      this.configService.get<string>("TEMPORAL_TASK_QUEUE") || "ocr-processing";
  }

  private async ensureDefaultNamespace(): Promise<void> {
    try {
      await this.connection!.workflowService.describeNamespace({
        namespace: "default",
      });
      this.logger.debug("Default namespace exists.");
    } catch (e: unknown) {
      const msg = String((e as Error).message);
      if (/NOT_FOUND|not found|does not exist/i.test(msg)) {
        await this.connection!.workflowService.registerNamespace({
          namespace: "default",
          workflowExecutionRetentionPeriod: { seconds: 86400 } as never,
          description: "Default namespace for Temporal Server.",
        });
        this.logger.debug("Default namespace created.");
      } else {
        throw e;
      }
    }
  }

  private async ensureSearchAttributes(): Promise<void> {
    for (const { name } of TemporalClientService.SEARCH_ATTRIBUTES) {
      try {
        await this.connection!.operatorService.addSearchAttributes({
          namespace: this.namespace,
          searchAttributes: { [name]: TemporalClientService.KEYWORD },
        });
        this.logger.debug(`${name} registered.`);
      } catch (e: unknown) {
        const code = (e as { code?: number; details?: string })?.code;
        const details = String(
          (e as { details?: string })?.details ?? (e as Error).message,
        );
        if (
          code === 6 ||
          /ALREADY_EXISTS|already exists|already registered/i.test(details)
        ) {
          this.logger.debug(`${name} already exists, skipping.`);
        } else {
          throw e;
        }
      }
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log(
        `Connecting to Temporal at ${this.address} (namespace: ${this.namespace})`,
      );
      this.connection = await Connection.connect({
        address: this.address,
      });

      await this.ensureDefaultNamespace();
      await this.ensureSearchAttributes();

      this.client = new Client({
        connection: this.connection,
        namespace: this.namespace,
      });

      this.logger.log("Temporal client connected successfully");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to connect to Temporal: ${err.message}`, {
        error: err.message,
      });
      if (err.stack) {
        this.logger.debug("Temporal connection error stack", {
          stack: err.stack,
        });
      }
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.logger.log("Temporal connection closed");
    }
  }

  /**
   * Start a graph workflow execution
   */
  async startGraphWorkflow(
    documentId: string,
    workflowConfigId: string,
    initialCtx: Record<string, unknown>,
  ): Promise<string> {
    this.ensureClientInitialized();

    const workflowExecutionId = `graph-${documentId}`;

    try {
      this.logger.log(
        `[Temporal] Looking up graph workflow configuration: ${workflowConfigId}`,
      );
      const workflowConfig =
        await this.workflowService.getWorkflowVersionById(workflowConfigId);
      if (!workflowConfig) {
        throw new Error(
          `Workflow configuration not found: ${workflowConfigId}`,
        );
      }

      const graph = workflowConfig.config as GraphWorkflowConfig;
      const configHash = computeConfigHash(graph);
      const runnerVersion = "1.0.0";

      const workflowType = WORKFLOW_TYPES.GRAPH_WORKFLOW;
      const requestId = getRequestContext()?.requestId;

      const handle = await this.client!.workflow.start(workflowType, {
        args: [
          {
            graph,
            initialCtx,
            configHash,
            runnerVersion,
            ...(requestId && { requestId }),
          },
        ],
        taskQueue: this.taskQueue,
        workflowId: workflowExecutionId,
        workflowExecutionTimeout: "30 minutes",
        searchAttributes: {
          DocumentId: [documentId],
          FileName: [String(initialCtx.fileName ?? "")],
          FileType: [String(initialCtx.fileType ?? "")],
          Status: ["ongoing_ocr"],
        },
        memo: {
          documentId,
          workflowConfigId,
          workflowVersion: workflowConfig.version,
          configHash,
          runnerVersion,
        },
      });

      this.logger.log(
        `Graph workflow started: ${handle.workflowId} for document ${documentId} (config ${workflowConfigId}, version ${workflowConfig.version})`,
      );
      return handle.workflowId;
    } catch (error) {
      throw this.handleError(error, "start graph workflow");
    }
  }

  /**
   * Get workflow status
   * @param workflowId Workflow execution ID
   * @returns Workflow status and result if available
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    status: string;
    result?: unknown;
  }> {
    this.ensureClientInitialized();

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
      throw this.handleError(error, `get workflow status for ${workflowId}`);
    }
  }

  /**
   * Get workflow result (waits if not ready)
   * @param workflowId Workflow execution ID
   * @returns Workflow result
   */
  async getWorkflowResult(workflowId: string): Promise<unknown> {
    this.ensureClientInitialized();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      return await handle.result();
    } catch (error) {
      throw this.handleError(error, `get workflow result for ${workflowId}`);
    }
  }

  /**
   * Query workflow status
   * @param workflowId Workflow execution ID
   * @returns Workflow status information
   */
  async queryWorkflowStatus(workflowId: string): Promise<{
    currentStep: string;
    status: string;
    apimRequestId?: string;
    retryCount?: number;
    maxRetries?: number;
    error?: string;
  }> {
    this.ensureClientInitialized();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      const status = await handle.query<{
        currentStep: string;
        status: string;
        apimRequestId?: string;
        retryCount?: number;
        maxRetries?: number;
        error?: string;
      }>("getStatus");
      return status;
    } catch (error) {
      throw this.handleError(error, `query workflow status for ${workflowId}`);
    }
  }

  /**
   * Query workflow progress
   * @param workflowId Workflow execution ID
   * @returns Workflow progress information
   */
  async queryWorkflowProgress(workflowId: string): Promise<{
    retryCount: number;
    maxRetries: number;
    currentStep: string;
    apimRequestId?: string;
    progressPercentage: number;
  }> {
    this.ensureClientInitialized();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      const progress = await handle.query<{
        retryCount: number;
        maxRetries: number;
        currentStep: string;
        apimRequestId?: string;
        progressPercentage: number;
      }>("getProgress");
      return progress;
    } catch (error) {
      throw this.handleError(
        error,
        `query workflow progress for ${workflowId}`,
      );
    }
  }

  /**
   * Cancel a workflow execution
   * @param workflowId Workflow execution ID
   * @param mode Cancellation mode: 'graceful' (wait for current activity) or 'immediate' (cancel immediately)
   */
  async cancelWorkflow(
    workflowId: string,
    mode: "graceful" | "immediate" = "graceful",
  ): Promise<void> {
    this.ensureClientInitialized();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      await handle.signal("cancel", { mode });
      this.logger.log(
        `Cancellation signal sent to workflow ${workflowId} (mode: ${mode})`,
      );
    } catch (error) {
      throw this.handleError(error, `cancel workflow ${workflowId}`);
    }
  }

  /**
   * Send human approval signal to a workflow
   * @param workflowId Workflow execution ID
   * @param approval Approval data with approved flag, reviewer, comments, rejection reason, and annotations
   */
  async sendHumanApproval(
    workflowId: string,
    approval: {
      approved: boolean;
      reviewer?: string;
      comments?: string;
      rejectionReason?: string;
      annotations?: string;
    },
  ): Promise<void> {
    this.ensureClientInitialized();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      await handle.signal("humanApproval", approval);
      this.logger.log(
        `Human approval signal sent to workflow ${workflowId}: ${approval.approved ? "approved" : "rejected"}`,
      );
    } catch (error) {
      throw this.handleError(
        error,
        `send human approval to workflow ${workflowId}`,
      );
    }
  }
}
