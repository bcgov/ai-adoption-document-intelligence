import { gunzipSync } from "node:zlib";
import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import {
  GZIP_ORIGINAL_ENCODING_METADATA_KEY,
  GZIP_PAYLOAD_CODEC_ENCODING,
} from "@ai-di/temporal-payload-codec";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Client,
  Connection,
  defaultPayloadConverter,
  WorkflowNotFoundError,
} from "@temporalio/client";
import { METADATA_ENCODING_KEY, type Payload } from "@temporalio/common";
import type { temporal } from "@temporalio/proto";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";
import { computeConfigHashWithOverrides } from "../workflow/config-hash";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";
import { WorkflowService } from "../workflow/workflow.service";
import { temporalDataConverter } from "./temporal-data-converter";
import { WORKFLOW_TYPES } from "./workflow-types";

/**
 * Temporal `ExecutionStatus` enum names that visibility queries accept as
 * the right-hand side of `ExecutionStatus = "..."`. Excludes
 * `Terminated`, `TimedOut`, and `ContinuedAsNew` — none of those are
 * reachable from a graph workflow's lifecycle (the worker doesn't issue
 * terminate signals, run timeout is bounded above, and there is no
 * continue-as-new path).
 */
export type TemporalExecutionStatusFilter =
  | "Running"
  | "Completed"
  | "Failed"
  | "Canceled";

/**
 * What started a graph workflow run, recorded on the `RunTrigger` search
 * attribute (G-021):
 *
 * - `"try"` — an editor preview started from the canvas Try tab. These are
 *   disposable: starting a new Try cancels the in-flight ones for the same
 *   lineage.
 * - `"api"` — a production run (the `/runs` API, or a document processed by
 *   `OcrService`). These are never cancelled by a subsequent start.
 *
 * Every call site must state its trigger explicitly — there is no default,
 * because guessing wrong here either cancels production work or leaks
 * abandoned previews.
 */
export type RunTrigger = "try" | "api";

/**
 * Decoded form of a single Temporal `WorkflowExecutionInfo` row, narrowed
 * to the fields the run-history endpoint (US-150) consumes. Surfaced from
 * {@link TemporalClientService.listRunsForWorkflow}.
 *
 * `versionNumber` is read from the start-time memo (`memo.workflowVersion`,
 * populated by {@link TemporalClientService.startGraphWorkflow}) — no
 * Postgres lookup is required. `null` only when an execution was started
 * outside `startGraphWorkflow` (defensive — should not happen in
 * production).
 */
export interface ListRunsExecution {
  /** Temporal workflow execution id. */
  runId: string;
  /** `WorkflowVersion.id` the run executed against (from search attribute). */
  workflowVersionId: string | null;
  /** Human-readable version number (from `memo.workflowVersion`). */
  versionNumber: number | null;
  /** Lifecycle state of the execution. */
  status: TemporalExecutionStatusFilter | "Unknown";
  /** Execution start time (UTC). */
  startedAt: Date;
  /** Execution close time (UTC). `null` for in-flight runs. */
  endedAt: Date | null;
}

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
    // Phase 4 (US-146 / US-150 / US-152). `WorkflowLineageId` keys
    // visibility queries to a workflow lineage (one query attribute
    // shared by the cancel-in-flight helper, the run-history endpoint,
    // and the per-version run-count endpoint).
    { name: "WorkflowLineageId" },
    // Phase 4 (US-152). `WorkflowVersionId` lets the version-row badge
    // count runs per pinned version.
    { name: "WorkflowVersionId" },
    // G-021. `RunTrigger` distinguishes an editor preview ("try") from a
    // production run ("api"). The cancel-on-new-Try helper
    // (`cancelInFlightTriesForLineage`) filters on it — without it the
    // visibility query matched every running execution in the lineage, so
    // starting a second production run cancelled the first.
    { name: "RunTrigger" },
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
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

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
        dataConverter: temporalDataConverter,
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
   * Start a graph workflow execution.
   *
   * When `documentId` is omitted (ad-hoc run from the Run drawer or
   * direct API trigger), the doc-specific search attributes / memo
   * keys are skipped and the Temporal execution id is generated with
   * a synthetic `graph-adhoc-<uuid>` prefix.
   *
   * @param trigger G-021: `"try"` for an editor preview, `"api"` for a
   *        production run. Recorded on the `RunTrigger` search attribute so
   *        `cancelInFlightTriesForLineage` can cancel previews without
   *        touching production runs. Deliberately required — see
   *        {@link RunTrigger}.
   */
  async startGraphWorkflow(
    documentId: string | undefined,
    workflowConfigId: string,
    initialCtx: Record<string, unknown>,
    groupId: string | null,
    trigger: RunTrigger,
    workflowConfigOverrides?: Record<string, unknown>,
  ): Promise<string> {
    this.ensureClientInitialized();

    const workflowExecutionId = documentId
      ? `graph-${documentId}`
      : `graph-adhoc-${crypto.randomUUID()}`;

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
      const configHash = computeConfigHashWithOverrides(
        graph,
        workflowConfigOverrides,
      );
      const runnerVersion = "1.0.0";

      const workflowType = WORKFLOW_TYPES.GRAPH_WORKFLOW;
      const requestId = getRequestContext()?.requestId;
      const hasOverrides =
        workflowConfigOverrides !== undefined &&
        Object.keys(workflowConfigOverrides).length > 0;

      const searchAttributes: Record<string, string[]> = documentId
        ? {
            DocumentId: [documentId],
            FileName: [String(initialCtx.fileName ?? "")],
            FileType: [String(initialCtx.fileType ?? "")],
            Status: ["ongoing_ocr"],
            // Phase 4: visibility queries for the cancel-in-flight
            // helper (US-146), the run-history endpoint (US-150), and
            // the per-version run-count endpoint (US-152) all key on
            // these two attributes. Set them for every start regardless
            // of doc-mode vs adhoc-mode.
            WorkflowLineageId: [workflowConfig.id],
            WorkflowVersionId: [workflowConfigId],
            // G-021: marks this run as a preview or a production run so the
            // cancel-on-new-Try helper can tell them apart.
            RunTrigger: [trigger],
          }
        : {
            Status: ["ongoing_adhoc"],
            WorkflowLineageId: [workflowConfig.id],
            WorkflowVersionId: [workflowConfigId],
            RunTrigger: [trigger],
          };

      const memo: Record<string, unknown> = {
        workflowConfigId,
        workflowVersion: workflowConfig.version,
        configHash,
        runnerVersion,
        ...(documentId && { documentId }),
      };

      const handle = await this.client!.workflow.start(workflowType, {
        args: [
          {
            workflowVersionId: workflowConfigId,
            initialCtx,
            configHash,
            runnerVersion,
            groupId,
            // Phase 4 (US-133): the per-node activity-output cache is scoped
            // by lineage id. `workflowConfig.id` is the `WorkflowLineage.id`
            // (per `WorkflowService.mapLineageAndVersion`). Passing it lets
            // the worker decorator key cache rows by lineage so that
            // identical configs across versions share cache.
            workflowLineageId: workflowConfig.id,
            // G-021 / Phase 4.x: `trigger` travels in the workflow input so
            // the worker can gate the activity-output cache to editor Try
            // runs only (production-scope caching is deferred pending a GDPR
            // review). The same value is stamped on the `RunTrigger` search
            // attribute above for visibility queries.
            trigger,
            // Item 4 (security): the caller's `x-api-key` is no longer
            // threaded into the workflow input — Temporal persists workflow
            // input in durable history, so it would leak in cleartext. The
            // worker's `dyn.run` activity authenticates server-side instead
            // (a short-lived, group-scoped internal token minted per
            // invocation — see `InternalTokenService`).
            ...(requestId && { requestId }),
            ...(hasOverrides && { workflowConfigOverrides }),
          },
        ],
        taskQueue: this.taskQueue,
        workflowId: workflowExecutionId,
        workflowExecutionTimeout: "30 minutes",
        searchAttributes,
        memo,
      });

      this.logger.log(
        documentId
          ? `Graph workflow started: ${handle.workflowId} for document ${documentId} (config ${workflowConfigId}, version ${workflowConfig.version})`
          : `Graph workflow started: ${handle.workflowId} ad-hoc (config ${workflowConfigId}, version ${workflowConfig.version})`,
      );
      // Return the runId (unique per execution attempt) as the billing execution
      // ID. workflowId is always "graph-<documentId>" and is reused on reprocess;
      // runId is unique so billing events from different runs stay isolated.
      return handle.firstExecutionRunId;
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
   * Reports whether a workflow execution is currently Running.
   *
   * Returns false when no execution exists for the given ID (never started, or
   * the record was reclaimed), so callers can safely treat a missing execution
   * as "not running" — e.g. an orphaned document whose prior run already closed.
   *
   * @param workflowId Workflow execution ID
   */
  async isWorkflowRunning(workflowId: string): Promise<boolean> {
    this.ensureClientInitialized();

    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      const description = await handle.describe();
      return description.status.name === "RUNNING";
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return false;
      }
      throw this.handleError(error, `check running state for ${workflowId}`);
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
   * Query the per-node live run status map for a graph workflow run.
   *
   * Wraps Temporal's name-based query handle so callers don't depend on
   * `@temporalio/workflow`'s `QueryDefinition` (a workflow-sandbox API not
   * installed in this app). The query type string MUST match the symbol
   * defined in `apps/temporal/src/graph-workflow-queries.ts`
   * (`getNodeStatusesQuery = defineQuery<...>("getNodeStatuses")`).
   *
   * Errors are propagated unmodified (notably `WorkflowNotFoundError` from
   * `@temporalio/client`) so the controller can map them to HTTP semantics.
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L19,
   *       docs-md/workflows/TRY_IN_PLACE_DESIGN.md §3.2.
   *
   * @param workflowId Temporal workflow execution id (runId in the canvas)
   * @returns The query response — a `Record<string, NodeRunStatus>`-shaped map
   */
  async queryNodeStatuses<
    NodeRunStatus = {
      status: "pending" | "running" | "succeeded" | "failed" | "skipped";
      startedAt?: string;
      endedAt?: string;
      errorMessage?: string;
      cacheHit?: { configHash: string; inputHash: string };
    },
  >(workflowId: string): Promise<Record<string, NodeRunStatus>> {
    this.ensureClientInitialized();
    const handle = this.client!.workflow.getHandle(workflowId);
    return await handle.query<Record<string, NodeRunStatus>>("getNodeStatuses");
  }

  /**
   * Resolve the `startedAt + endedAt` execution window for a Temporal
   * workflow run by calling `WorkflowHandle.describe()`.
   *
   * For in-flight runs, `endedAt` is `null` — callers must substitute the
   * current time as the upper bound when querying the cache.
   *
   * Errors are propagated unmodified (notably `WorkflowNotFoundError`
   * from `@temporalio/client`) so the controller can map them to HTTP
   * semantics in the same way `queryNodeStatuses` does.
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L20,
   *       docs-md/workflows/TRY_IN_PLACE_DESIGN.md §2.5.
   *
   * @param workflowId Temporal workflow execution id (runId in the canvas)
   * @returns `{ startedAt, endedAt, trigger }` where `endedAt` is `null`
   *          for runs that have not yet closed and `trigger` is the run's
   *          decoded `RunTrigger` search attribute (`null` when absent —
   *          see {@link getRunTrigger} for what callers must do with that).
   */
  async getRunWindow(workflowId: string): Promise<{
    startedAt: Date;
    endedAt: Date | null;
    trigger: RunTrigger | null;
  }> {
    this.ensureClientInitialized();
    const handle = this.client!.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return {
      startedAt: description.startTime,
      endedAt: description.closeTime ?? null,
      trigger: extractRunTrigger(description.searchAttributes),
    };
  }

  /**
   * Resolve a run's `RunTrigger` search attribute via `describe()`.
   *
   * Backs the per-run editor endpoints' Try-only scoping (G-021 follow-up):
   * `GET /:id/runs/:runId/node-statuses` and `GET /:id/runs/:runId/input-ctx`
   * must refuse production (`"api"`) runs, and the search attribute is the
   * cheapest reliable source — it is stamped by `startGraphWorkflow` on
   * every run since G-021, including runs that predate `trigger` travelling
   * in the workflow input, and reading it does not fetch history.
   *
   * Returns `null` when the attribute is absent or carries an unknown value
   * (a run started before G-021, or a foreign writer to the namespace).
   * Callers MUST fail closed on `null` — an unattributable run is treated as
   * production, the same direction `cancelInFlightTriesForLineage` takes.
   *
   * Errors are propagated unmodified (notably `WorkflowNotFoundError`) so
   * the controller can map them to HTTP semantics the same way
   * `queryNodeStatuses` does.
   */
  async getRunTrigger(workflowId: string): Promise<RunTrigger | null> {
    this.ensureClientInitialized();
    const handle = this.client!.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return extractRunTrigger(description.searchAttributes);
  }

  /**
   * Resolve the `initialCtx` and the producing `workflowLineageId` for a
   * Temporal run by decoding the `WorkflowExecutionStarted` event in the
   * run's history.
   *
   * `startGraphWorkflow` starts every graph workflow with a single
   * positional argument of shape `{ graph, initialCtx, configHash,
   * runnerVersion, groupId, workflowLineageId, requestId? }` — this
   * helper decodes that first payload via the default payload converter
   * and pulls `initialCtx` + `workflowLineageId` off it.
   *
   * Returns `null` when the run's history is unavailable (retention-
   * cleaned), when the first event is not a `WorkflowExecutionStarted`,
   * when no input payload is present, or when the decoded payload does
   * not carry an `initialCtx`. Callers MUST treat `null` as a signal to
   * fall back to alternate sources of the input ctx (e.g. the cache row
   * for the run's source node — see US-151 §6.4 in TRY_IN_PLACE_DESIGN.md).
   *
   * Errors from the underlying `fetchHistory()` call are propagated
   * unmodified (notably `WorkflowNotFoundError` from `@temporalio/client`)
   * so the controller can map them to HTTP semantics.
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L23,
   *       docs-md/workflows/TRY_IN_PLACE_DESIGN.md §6.4.
   *
   * @param workflowId Temporal workflow execution id (runId in the canvas)
   * @returns `{ initialCtx, workflowLineageId }` decoded from the start
   *          event, or `null` when the input is not available.
   */
  async getRunInput(workflowId: string): Promise<{
    initialCtx: Record<string, unknown>;
    workflowLineageId: string | null;
  } | null> {
    this.ensureClientInitialized();
    const handle = this.client!.workflow.getHandle(workflowId);
    const history = await handle.fetchHistory();
    const events = history.events ?? [];
    if (events.length === 0) {
      return null;
    }
    const startedAttrs = events[0]?.workflowExecutionStartedEventAttributes;
    if (!startedAttrs) {
      return null;
    }
    const payloads = startedAttrs.input?.payloads ?? null;
    if (!payloads || payloads.length === 0) {
      return null;
    }
    // `fetchHistory()` returns payloads exactly as stored — still codec-encoded.
    // `startGraphWorkflow` payloads are gzip-compressed by `GzipPayloadCodec`
    // (the client's `payloadCodecs`), so they carry `encoding: binary/gzip` and
    // MUST be run back through the codec(s) before the payload converter —
    // otherwise `fromPayload` throws `ValueError: Unknown encoding: binary/gzip`,
    // which surfaced as a 500 on `GET /:id/runs/:runId/node-statuses`.
    const decodedPayloads = await this.decodeHistoryPayloads(payloads);
    // The graph workflow is started with a single positional argument
    // (see `startGraphWorkflow`); the first payload carries the start
    // args object. Narrow strictly: the decoded value must be a non-null
    // object containing an `initialCtx` key whose value is an object.
    // Anything else falls through to the fallback path.
    const decoded = defaultPayloadConverter.fromPayload<unknown>(
      decodedPayloads[0],
    );
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      Array.isArray(decoded)
    ) {
      return null;
    }
    const startArgs = decoded as Record<string, unknown>;
    const rawInitialCtx = startArgs.initialCtx;
    if (
      rawInitialCtx === null ||
      typeof rawInitialCtx !== "object" ||
      Array.isArray(rawInitialCtx)
    ) {
      return null;
    }
    const rawLineageId = startArgs.workflowLineageId;
    const workflowLineageId =
      typeof rawLineageId === "string" ? rawLineageId : null;
    return {
      initialCtx: rawInitialCtx as Record<string, unknown>,
      workflowLineageId,
    };
  }

  /**
   * Reverse the client's payload codecs over raw history payloads so a
   * `PayloadConverter` can read them. `fetchHistory()` (unlike `query()` /
   * activity results) does NOT apply the codecs, so payloads come back exactly
   * as stored — gzip-compressed by {@link temporalDataConverter}'s
   * `GzipPayloadCodec`. Codecs decode in the reverse of their encode order.
   * A codec passes through payloads it did not encode, so this is safe for
   * both gzip- and plain-encoded histories.
   */
  private async decodeHistoryPayloads(
    payloads: temporal.api.common.v1.IPayload[],
  ): Promise<Payload[]> {
    let decoded = payloads as Payload[];
    const { payloadCodecs } = temporalDataConverter;
    for (let i = payloadCodecs.length - 1; i >= 0; i--) {
      decoded = await payloadCodecs[i].decode(decoded);
    }
    return decoded;
  }

  /**
   * List workflow execution ids that are currently `Running` for the
   * given `WorkflowLineageId`. Used by the Phase 4 cancel-on-new-Try
   * helper (`WorkflowService.cancelInFlightTriesForLineage`).
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L26,
   *       docs-md/workflows/TRY_IN_PLACE_DESIGN.md §5.1.
   *
   * Returns an empty array when no runs match — the visibility-store
   * query is safe to issue against a lineage that's never been Tried.
   *
   * @param workflowLineageId The `WorkflowLineage.id` to filter on.
   * @param trigger G-021: when supplied, narrows the result to runs stamped
   *        with that `RunTrigger`. The cancel-on-new-Try helper passes
   *        `"try"` so it cannot reach production runs. Omitted means "every
   *        running run in the lineage, whatever started it".
   * @returns Workflow execution ids of running runs (caller passes
   *          each through `cancelRun`).
   */
  async listRunningInLineage(
    workflowLineageId: string,
    trigger?: RunTrigger,
  ): Promise<string[]> {
    this.ensureClientInitialized();
    // The visibility query language quotes string values with `"..."` —
    // the lineage id never contains `"` characters (it's a Prisma cuid),
    // but we still defensively reject embedded quotes to avoid query
    // injection in case the id source ever changes.
    if (workflowLineageId.includes('"')) {
      throw new Error(
        `Invalid workflowLineageId (contains quote): ${workflowLineageId}`,
      );
    }
    // `trigger` is a closed union, never caller-supplied free text, so it
    // needs no quote guard.
    const query = trigger
      ? `WorkflowLineageId = "${workflowLineageId}" AND ExecutionStatus = "Running" AND RunTrigger = "${trigger}"`
      : `WorkflowLineageId = "${workflowLineageId}" AND ExecutionStatus = "Running"`;
    const workflowIds: string[] = [];
    for await (const execution of this.client!.workflow.list({ query })) {
      workflowIds.push(execution.workflowId);
    }
    return workflowIds;
  }

  /**
   * Count Temporal workflow executions that match the
   * `(workflowLineageId, workflowVersionId)` pair. Backs the per-version
   * run-count badge on `VersionHistoryDrawer` (US-152).
   *
   * Editor Try runs only (`RunTrigger = "try"`), matching `listRunsForWorkflow`
   * — the badge and the run-history drawer it opens must agree on what a
   * "run" is. Production (`"api"`) runs are monitored in the Processing
   * queue, not counted here.
   *
   * Uses the raw `WorkflowService.countWorkflowExecutions` gRPC method
   * (the higher-level `client.workflow.count` helper isn't available in
   * SDK 1.10.x). The visibility-store count is approximate but is the
   * cheapest way to answer "how many runs match this query" — far less
   * I/O than `list` + paginate-count.
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L24,
   *       docs-md/workflows/TRY_IN_PLACE_DESIGN.md §6.5.
   *
   * @param workflowLineageId The `WorkflowLineage.id` to filter on.
   * @param workflowVersionId The `WorkflowVersion.id` to filter on.
   * @returns Approximate count of matching executions (closed + running).
   */
  async countRunsForVersion(
    workflowLineageId: string,
    workflowVersionId: string,
  ): Promise<number> {
    this.ensureClientInitialized();
    // The visibility query language quotes string values with `"..."` —
    // both ids are Prisma cuids in practice (no embedded `"`), but reject
    // any embedded quote defensively to keep the query-string injection
    // surface zero.
    if (workflowLineageId.includes('"')) {
      throw new Error(
        `Invalid workflowLineageId (contains quote): ${workflowLineageId}`,
      );
    }
    if (workflowVersionId.includes('"')) {
      throw new Error(
        `Invalid workflowVersionId (contains quote): ${workflowVersionId}`,
      );
    }
    // `RunTrigger = "try"` is a literal (no caller input), so it needs no
    // quote guard.
    const query = `WorkflowLineageId = "${workflowLineageId}" AND WorkflowVersionId = "${workflowVersionId}" AND RunTrigger = "try"`;
    const response =
      await this.connection!.workflowService.countWorkflowExecutions({
        namespace: this.namespace,
        query,
      });
    // `count` is a protobuf `Long` — convert to a JS `number`. Run counts
    // never approach `Number.MAX_SAFE_INTEGER` (a workflow with 2^53
    // executions is not a realistic Phase 4 scenario), so the narrowing
    // is safe.
    const count = response.count;
    if (count === null || count === undefined) {
      return 0;
    }
    return typeof count === "number" ? count : count.toNumber();
  }

  /**
   * List historical Temporal workflow executions for a single workflow
   * lineage, with optional filters (status, start-time range, pinned
   * version) and cursor-based pagination. Backs `GET /api/workflows/:id/runs`
   * — the run-history endpoint surfaced by `RunHistoryDrawer` (US-150).
   *
   * Editor Try runs only: every query carries `RunTrigger = "try"`. Run
   * history is an editor surface — a production run's `initialCtx` carries
   * document identifiers and filenames that must not surface in the
   * designer's drawer. Production runs are monitored in the Processing
   * queue instead. Runs that predate the `RunTrigger` attribute (G-021)
   * carry no value and therefore do not match, the safe direction.
   *
   * Uses the raw `WorkflowService.listWorkflowExecutions` gRPC method
   * directly (rather than the higher-level `client.workflow.list` async
   * iterator) so callers can consume Temporal's opaque page-token cursor
   * verbatim — the public iterator auto-paginates and hides the token.
   *
   * `memo.workflowVersion` is decoded via `defaultPayloadConverter`; we
   * read the version number from there rather than issuing a Postgres
   * `findMany` on `WorkflowVersion` (the memo is populated for every
   * start, see `startGraphWorkflow`).
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L21,
   *       docs-md/workflows/TRY_IN_PLACE_DESIGN.md §6.1.
   *
   * @param params.workflowLineageId Lineage to filter on (required).
   * @param params.status Optional Temporal `ExecutionStatus` filter value
   *   (`Running` | `Completed` | `Failed` | `Canceled`).
   * @param params.startedAfter Optional ISO-8601 lower bound on `StartTime`.
   * @param params.startedBefore Optional ISO-8601 upper bound on `StartTime`.
   * @param params.workflowVersionId Optional pinned-version filter.
   * @param params.pageSize Page size for the underlying gRPC call.
   * @param params.cursor Opaque cursor (base64-encoded `nextPageToken`)
   *   returned by a previous call. Omit for the first page.
   * @returns Decoded executions + the `nextCursor` to fetch the next page
   *   (or `null` when the result set is exhausted).
   */
  async listRunsForWorkflow(params: {
    workflowLineageId: string;
    status?: "Running" | "Completed" | "Failed" | "Canceled";
    startedAfter?: string;
    startedBefore?: string;
    workflowVersionId?: string;
    pageSize: number;
    cursor?: string;
  }): Promise<{
    executions: ListRunsExecution[];
    nextCursor: string | null;
  }> {
    this.ensureClientInitialized();

    const {
      workflowLineageId,
      status,
      startedAfter,
      startedBefore,
      workflowVersionId,
      pageSize,
      cursor,
    } = params;

    // Defensive: visibility query strings quote with `"..."`. Reject any
    // embedded quote on caller-supplied filter values to keep query-string
    // injection surface zero. (All real values are Prisma cuids / Temporal
    // enum names / ISO-8601 timestamps — none of which contain `"`.)
    if (workflowLineageId.includes('"')) {
      throw new Error(
        `Invalid workflowLineageId (contains quote): ${workflowLineageId}`,
      );
    }
    if (workflowVersionId?.includes('"')) {
      throw new Error(
        `Invalid workflowVersionId (contains quote): ${workflowVersionId}`,
      );
    }

    const clauses: string[] = [
      `WorkflowLineageId = "${workflowLineageId}"`,
      // Editor surface: Try runs only (see the method doc). A literal, so
      // no quote guard is needed.
      `RunTrigger = "try"`,
    ];
    if (status) {
      clauses.push(`ExecutionStatus = "${status}"`);
    }
    if (startedAfter) {
      clauses.push(`StartTime >= "${startedAfter}"`);
    }
    if (startedBefore) {
      clauses.push(`StartTime <= "${startedBefore}"`);
    }
    if (workflowVersionId) {
      clauses.push(`WorkflowVersionId = "${workflowVersionId}"`);
    }
    const query = clauses.join(" AND ");

    // Cursor wire format: the gRPC API takes `nextPageToken` as an opaque
    // `Uint8Array` (bytes the server hands back on each page). Encode it
    // as base64 so it survives a JSON round-trip to the frontend.
    const nextPageToken = cursor
      ? Buffer.from(cursor, "base64")
      : Buffer.alloc(0);

    const response =
      await this.connection!.workflowService.listWorkflowExecutions({
        namespace: this.namespace,
        query,
        pageSize,
        nextPageToken,
      });

    const executions: ListRunsExecution[] = (response.executions ?? []).map(
      (raw) => decodeListRunsExecution(raw),
    );

    // Temporal signals "no more pages" with an empty/missing token.
    const outToken = response.nextPageToken;
    const nextCursor =
      outToken && outToken.length > 0
        ? Buffer.from(outToken).toString("base64")
        : null;

    return { executions, nextCursor };
  }

  /**
   * Request cancellation of a single workflow execution by id. Wraps
   * `WorkflowHandle.cancel()` (the Temporal client API that maps to
   * RequestCancelWorkflowExecution — graceful, awaits server ack).
   *
   * Errors raised because the run has already completed / been cancelled
   * are intentionally swallowed: the cancel-on-new-Try semantics are
   * race-tolerant. A race-loser (Try B beating Try A's natural close to
   * the cancel call) is harmless.
   *
   * Other errors (network, gRPC) are propagated unmodified so the caller
   * can surface them when the cancel was an explicit user action.
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L26.
   *
   * @param workflowId Temporal workflow execution id (runId in the canvas)
   */
  async cancelRun(workflowId: string): Promise<void> {
    this.ensureClientInitialized();
    try {
      const handle = this.client!.workflow.getHandle(workflowId);
      await handle.cancel();
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : String(error)
      ).toLowerCase();
      const isAlreadyClosed =
        /already completed|already terminated|already cancelled|workflow execution already completed|not running|workflow not found/i.test(
          message,
        );
      if (isAlreadyClosed) {
        // Race-tolerant: the run finished naturally between visibility
        // read and cancel write. Treat as a successful no-op.
        this.logger.debug(
          `cancelRun: workflow ${workflowId} already closed; ignoring (${message})`,
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Cancel all in-flight Try executions for a workflow lineage.
   * Best-effort + race-tolerant — moved here from WorkflowService to break
   * a NestJS circular dependency (US-146 originally landed in
   * WorkflowService but that introduced an init-order cycle with this
   * service's existing dep on WorkflowService.getWorkflowVersionById).
   *
   * Spec: feature-docs/.../REQUIREMENTS.md L26, TRY_IN_PLACE_DESIGN.md §1, §5.1.
   *
   * G-021: only runs stamped `RunTrigger = "try"` are eligible. Before that
   * attribute existed the query matched every running execution in the
   * lineage, so starting run #2 of a production batch cancelled run #1.
   *
   * Migration note: runs started before `RunTrigger` shipped carry no value
   * for it and therefore no longer match, so they will not be cancelled.
   * That is the safe direction — an unknown run is treated as production.
   */
  async cancelInFlightTriesForLineage(
    workflowLineageId: string,
  ): Promise<{ cancelledCount: number }> {
    const workflowIds = await this.listRunningInLineage(
      workflowLineageId,
      "try",
    );
    if (workflowIds.length === 0) {
      return { cancelledCount: 0 };
    }

    const results = await Promise.allSettled(
      workflowIds.map((workflowId) => this.cancelRun(workflowId)),
    );

    let cancelledCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        cancelledCount++;
      } else {
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        this.logger.warn(
          `cancelInFlightTriesForLineage: cancel of ${workflowIds[i]} (lineage ${workflowLineageId}) failed: ${reason}`,
        );
      }
    }

    this.logger.log(
      `cancelInFlightTriesForLineage: lineage ${workflowLineageId} — cancelled ${cancelledCount}/${workflowIds.length} in-flight Try run(s)`,
    );

    return { cancelledCount };
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
   * Permanently deletes a workflow execution's history and visibility record
   * from Temporal. Used by the ephemeral-document cleanup janitor to drop the
   * Temporal footprint of completed documents ahead of the namespace retention
   * window. Only valid for closed (completed/failed/terminated) executions.
   *
   * Idempotent: a NOT_FOUND response (already deleted or already expired by
   * retention) is treated as success so callers can safely mark the work done.
   *
   * @param workflowId Workflow execution ID
   */
  async deleteWorkflowExecution(workflowId: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Temporal client not initialized");
    }

    try {
      await this.connection.workflowService.deleteWorkflowExecution({
        namespace: this.namespace,
        workflowExecution: { workflowId },
      });
      this.logger.log(`Deleted Temporal execution record for ${workflowId}`);
    } catch (error) {
      if (getErrorMessage(error).toLowerCase().includes("not found")) {
        this.logger.debug(
          `Temporal execution ${workflowId} already absent; nothing to delete`,
        );
        return;
      }
      throw this.handleError(error, `delete Temporal execution ${workflowId}`);
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

/**
 * Map Temporal's protobuf `WorkflowExecutionStatus` enum onto the narrow
 * subset the run-history endpoint surfaces. Anything outside the known set
 * (`TERMINATED`, `TIMED_OUT`, etc.) is reported as `"Unknown"` rather than
 * silently coerced — the canvas should not pretend a terminated run is
 * the same as a cancelled one.
 */
function statusFromCode(
  code: temporal.api.enums.v1.WorkflowExecutionStatus | undefined | null,
): TemporalExecutionStatusFilter | "Unknown" {
  // Avoid importing the protobuf enum at runtime — match on the numeric
  // values directly. Mapping mirrors `apps/backend-services/node_modules/
  // @temporalio/client/lib/helpers.js#workflowStatusCodeToName`.
  switch (code) {
    case 1: // WORKFLOW_EXECUTION_STATUS_RUNNING
      return "Running";
    case 2: // WORKFLOW_EXECUTION_STATUS_COMPLETED
      return "Completed";
    case 3: // WORKFLOW_EXECUTION_STATUS_FAILED
      return "Failed";
    case 4: // WORKFLOW_EXECUTION_STATUS_CANCELED
      return "Canceled";
    default:
      return "Unknown";
  }
}

/**
 * Convert a protobuf `ITimestamp` to a `Date`. The protobuf type holds a
 * `Long` for `seconds` and a `number` for `nanos`; we drop sub-millisecond
 * precision (Temporal's resolution is microsecond at best, far above
 * what a UI cares about). Returns `null` when the timestamp is absent.
 */
function tsToDate(
  ts:
    | {
        seconds?: { toNumber: () => number } | number | null;
        nanos?: number | null;
      }
    | null
    | undefined,
): Date | null {
  if (!ts) {
    return null;
  }
  const seconds = ts.seconds;
  const secondsNum =
    typeof seconds === "number"
      ? seconds
      : seconds && typeof seconds.toNumber === "function"
        ? seconds.toNumber()
        : 0;
  const nanos = typeof ts.nanos === "number" ? ts.nanos : 0;
  return new Date(secondsNum * 1000 + Math.floor(nanos / 1_000_000));
}

/**
 * Undo `GzipPayloadCodec` for a single payload, synchronously.
 *
 * Payload CODECS are not applied to `memo` fields on the way back out: the
 * SDK runs them over workflow args and results, but `describe` / `list`
 * hand back the memo as raw protobuf. So a memo written through the gzip
 * codec arrives still compressed, carrying `encoding: "binary/gzip"` — an
 * encoding `defaultPayloadConverter` does not know, so it throws.
 *
 * The codec preserves the pre-gzip encoding in `gzip-original-encoding`
 * precisely so decode can restore it; this reverses that. Synchronous
 * because the only caller (`decodeListRunsExecution`) is sync and exported
 * for test injection, and one memo field is a few bytes.
 */
function ungzipPayload(
  payload: temporal.api.common.v1.IPayload,
): temporal.api.common.v1.IPayload {
  const metadata = payload.metadata;
  const encodingBytes = metadata?.[METADATA_ENCODING_KEY];
  if (!encodingBytes || !payload.data) {
    return payload;
  }
  const encoding = new TextDecoder().decode(encodingBytes);
  if (encoding !== GZIP_PAYLOAD_CODEC_ENCODING) {
    return payload;
  }
  const original = metadata?.[GZIP_ORIGINAL_ENCODING_METADATA_KEY];
  const restored: Record<string, Uint8Array> = { ...metadata };
  delete restored[GZIP_ORIGINAL_ENCODING_METADATA_KEY];
  if (original) {
    restored[METADATA_ENCODING_KEY] = original;
  }
  return {
    metadata: restored,
    data: gunzipSync(Buffer.from(payload.data)),
  };
}

/**
 * Decode `memo.workflowVersion` from a Temporal execution's memo map.
 * Returns `null` when the memo entry is absent or not a number.
 *
 * Gzip-aware: without `ungzipPayload` every run reports a null version
 * number, because the memo is written through the gzip codec while the
 * sibling `workflowVersionId` — a SEARCH ATTRIBUTE, which codecs never
 * touch — decodes fine. That asymmetry is what made the bug look like
 * "some runs have no version" rather than "no run has one".
 */
function decodeWorkflowVersion(
  memo: temporal.api.common.v1.IMemo | null | undefined,
): number | null {
  const payload = memo?.fields?.workflowVersion;
  if (!payload) {
    return null;
  }
  try {
    const value = defaultPayloadConverter.fromPayload(
      ungzipPayload(payload) as temporal.api.common.v1.IPayload & {
        metadata: Record<string, Uint8Array>;
        data: Uint8Array;
      },
    );
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Decode the `WorkflowVersionId` keyword search attribute. Returns `null`
 * when the attribute is absent (defensive — `startGraphWorkflow` always
 * sets it for graph workflows).
 */
function decodeWorkflowVersionId(
  searchAttributes: temporal.api.common.v1.ISearchAttributes | null | undefined,
): string | null {
  const payload = searchAttributes?.indexedFields?.WorkflowVersionId;
  if (!payload) {
    return null;
  }
  try {
    const value = defaultPayloadConverter.fromPayload(
      payload as temporal.api.common.v1.IPayload & {
        metadata: Record<string, Uint8Array>;
        data: Uint8Array;
      },
    );
    // Temporal keyword search attributes round-trip as either `string` or
    // `string[]` depending on the server version; normalise to a single
    // string (the first entry) since we only ever set one value per start.
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Narrow the SDK-decoded `RunTrigger` search attribute (from
 * `WorkflowHandle.describe()`, which — unlike the raw protobuf visibility
 * responses — returns search attributes as plain JS values) to the
 * {@link RunTrigger} union. Temporal keyword attributes round-trip as
 * `string` or `string[]` depending on the server version, so both are
 * accepted; anything else — absent, empty, or an unknown value — is `null`,
 * which callers must treat as "not a Try run" (fail closed).
 */
export function extractRunTrigger(
  searchAttributes: unknown,
): RunTrigger | null {
  if (typeof searchAttributes !== "object" || searchAttributes === null) {
    return null;
  }
  const raw = (searchAttributes as Record<string, unknown>).RunTrigger;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "try" || value === "api" ? value : null;
}

/**
 * Decode a raw `IWorkflowExecutionInfo` protobuf message into the narrow
 * shape the run-history endpoint surfaces. Exported for test injection
 * (see `workflow.controller.spec.ts`); callers MUST treat the returned
 * object as read-only.
 */
export function decodeListRunsExecution(
  raw: temporal.api.workflow.v1.IWorkflowExecutionInfo,
): ListRunsExecution {
  const runId = raw.execution?.workflowId ?? "";
  const status = statusFromCode(raw.status);
  const startedAt = tsToDate(raw.startTime) ?? new Date(0);
  const endedAt = tsToDate(raw.closeTime);
  const workflowVersionId = decodeWorkflowVersionId(raw.searchAttributes);
  const versionNumber = decodeWorkflowVersion(raw.memo);
  return {
    runId,
    workflowVersionId,
    versionNumber,
    status,
    startedAt,
    endedAt,
  };
}
