import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client, Connection } from "@temporalio/client";
import { WorkflowService } from "../workflow/workflow.service";
import { VALID_WORKFLOW_STEP_IDS } from "./workflow-constants";
import { WORKFLOW_TYPES } from "./workflow-types";

@Injectable()
export class TemporalClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporalClientService.name);
  private connection: Connection | null = null;
  private client: Client | null = null;
  private readonly address: string;
  private readonly namespace: string;
  private readonly taskQueue: string;

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
      enhancedMessage += `. Search attributes must be registered in the Temporal namespace. Register them using: tctl search-attribute create --name <AttributeName> --type <Type>`;
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

  async onModuleInit(): Promise<void> {
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
            // Use the workflow configuration from the database
            // The config field contains WorkflowStepsConfig (direct step config)
            // Handle backward compatibility: config might be wrapped in a "steps" key
            const configData = workflowConfig.config as Record<string, unknown>;

            // Check if config is wrapped in "steps" key (backward compatibility)
            if (
              configData &&
              typeof configData === "object" &&
              "steps" in configData &&
              configData.steps
            ) {
              this.logger.debug(
                `[Temporal] Workflow config wrapped in "steps" key (legacy format), extracting...`,
              );
              const extractedSteps = configData.steps;
              if (extractedSteps && typeof extractedSteps === "object") {
                workflowSteps = extractedSteps as {
                  [key: string]:
                    | {
                        enabled?: boolean;
                        parameters?: Record<string, unknown>;
                      }
                    | undefined;
                };
              } else {
                this.logger.warn(
                  `[Temporal] Config has "steps" key but value is not an object, using config directly`,
                );
                workflowSteps = configData as {
                  [key: string]:
                    | {
                        enabled?: boolean;
                        parameters?: Record<string, unknown>;
                      }
                    | undefined;
                };
              }
            } else {
              // Config is in the correct format (step IDs as keys)
              // Filter out any invalid keys (for safety)
              const filteredConfig: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(configData)) {
                if (
                  VALID_WORKFLOW_STEP_IDS.includes(
                    key as (typeof VALID_WORKFLOW_STEP_IDS)[number],
                  )
                ) {
                  filteredConfig[key] = value;
                } else {
                  this.logger.debug(
                    `[Temporal] Filtering out invalid key "${key}" from workflow config`,
                  );
                }
              }

              workflowSteps = filteredConfig as {
                [key: string]:
                  | {
                      enabled?: boolean;
                      parameters?: Record<string, unknown>;
                    }
                  | undefined;
              };
            }

            this.logger.log(
              `[Temporal] Successfully loaded workflow configuration: "${workflowConfig.name}" (ID: ${workflowConfig.id})`,
            );
            this.logger.debug(
              `[Temporal] Workflow config: ${JSON.stringify(workflowSteps, null, 2)}`,
            );
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

      const workflowType = WORKFLOW_TYPES.OCR_WORKFLOW;

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
