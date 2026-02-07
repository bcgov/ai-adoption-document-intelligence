import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, Connection } from "@temporalio/client";
import { WorkflowService } from "../workflow/workflow.service";

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporalClientService.name);
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
      this.logger.error(
        `Failed to connect to Temporal: ${error.message}`,
        error.stack,
      );
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
   * Start an OCR workflow execution
   * @param documentId Document ID
   * @param fileData File data for OCR processing
   * @param steps Optional workflow steps configuration (overridden by workflowConfigId if provided)
   * @param workflowConfigId Optional workflow configuration ID from Workflow table
   * @returns Workflow execution ID
   */
  async startOCRWorkflow(
    documentId: string,
    fileData: {
      binaryData: string;
      fileName: string;
      fileType: string;
      contentType: string;
      modelId?: string;
    },
    steps?: {
      [key: string]:
        | {
            enabled?: boolean;
            parameters?: Record<string, unknown>;
          }
        | undefined;
    },
    workflowConfigId?: string,
  ): Promise<string> {
    this.ensureClientInitialized();

    const workflowExecutionId = `ocr-${documentId}`;

    try {
      // If workflowConfigId is provided, look up the workflow configuration from the database
      let workflowSteps = steps;
      let workflowVersion: number | undefined;
      if (workflowConfigId) {
        try {
          this.logger.log(
            `[Temporal] Looking up workflow configuration: ${workflowConfigId}`,
          );
          const workflowConfig =
            await this.workflowService.getWorkflowById(workflowConfigId);
          if (workflowConfig) {
            workflowVersion = workflowConfig.version;
            const configData = workflowConfig.config as Record<string, unknown>;
            if (configData && typeof configData === "object" && "schemaVersion" in configData) {
              this.logger.warn(
                `[Temporal] Workflow config ${workflowConfigId} is a graph config. startOCRWorkflow ignores graph configs; use graphWorkflow instead.`,
              );
            }
          } else {
            this.logger.warn(
              `[Temporal] Workflow configuration ${workflowConfigId} not found in database, using provided steps or defaults`,
            );
          }
        } catch (error) {
          this.logger.error(
            `[Temporal] Failed to load workflow configuration ${workflowConfigId}: ${error.message}`,
          );
          this.logger.error(
            `[Temporal] Error stack: ${error instanceof Error ? error.stack : "N/A"}`,
          );
          this.logger.warn(
            `[Temporal] Continuing with provided steps or defaults`,
          );
          // Continue with provided steps or defaults if workflow lookup fails
        }
      } else {
        this.logger.log(
          `[Temporal] No workflow configuration ID provided, using provided steps or defaults`,
        );
      }

      const workflowType = "ocrWorkflow";

      // Search attributes are registered in the Temporal namespace:
      // - DocumentId (Keyword)
      // - FileName (Keyword)
      // - FileType (Keyword)
      // - Status (Keyword)
      // These allow filtering workflows in the Temporal UI
      const handle = await this.client!.workflow.start(workflowType, {
        args: [
          {
            documentId,
            binaryData: fileData.binaryData,
            fileName: fileData.fileName,
            fileType: fileData.fileType as "pdf" | "image",
            contentType: fileData.contentType,
            modelId: fileData.modelId,
            steps: workflowSteps, // Use workflow configuration from database if available
          },
        ],
        taskQueue: this.taskQueue,
        workflowId: workflowExecutionId,
        workflowExecutionTimeout: "30 minutes",
        searchAttributes: {
          DocumentId: [documentId],
          FileName: [fileData.fileName],
          FileType: [fileData.fileType],
          Status: ["ongoing_ocr"],
        },
        memo: {
          documentId,
          fileName: fileData.fileName,
          fileType: fileData.fileType,
          workflowConfigId: workflowConfigId || undefined,
          workflowVersion: workflowVersion || undefined,
        },
      });

      this.logger.log(
        `Workflow started: ${handle.workflowId} for document ${documentId}${workflowConfigId ? ` using workflow config ${workflowConfigId}${workflowVersion ? ` (version ${workflowVersion})` : ""}` : ""}`,
      );
      return handle.workflowId;
    } catch (error) {
      throw this.handleError(error, "start OCR workflow");
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
