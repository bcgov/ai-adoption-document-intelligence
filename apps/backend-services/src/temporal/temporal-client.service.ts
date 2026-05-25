import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Client,
  Connection,
  defaultPayloadConverter,
} from "@temporalio/client";
import type { temporal } from "@temporalio/proto";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";
import { computeConfigHash } from "../workflow/config-hash";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";
import { WorkflowService } from "../workflow/workflow.service";
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
   */
  async startGraphWorkflow(
    documentId: string | undefined,
    workflowConfigId: string,
    initialCtx: Record<string, unknown>,
    groupId: string | null,
    graphOverride?: GraphWorkflowConfig,
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

      const graph = (graphOverride ??
        workflowConfig.config) as GraphWorkflowConfig;
      const configHash = computeConfigHash(graph);
      const runnerVersion = "1.0.0";

      const workflowType = WORKFLOW_TYPES.GRAPH_WORKFLOW;
      const requestId = getRequestContext()?.requestId;

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
          }
        : {
            Status: ["ongoing_adhoc"],
            WorkflowLineageId: [workflowConfig.id],
            WorkflowVersionId: [workflowConfigId],
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
            graph,
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
            ...(requestId && { requestId }),
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
   *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §3.2.
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
   *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §2.5.
   *
   * @param workflowId Temporal workflow execution id (runId in the canvas)
   * @returns `{ startedAt, endedAt }` where `endedAt` is `null` for runs
   *          that have not yet closed.
   */
  async getRunWindow(
    workflowId: string,
  ): Promise<{ startedAt: Date; endedAt: Date | null }> {
    this.ensureClientInitialized();
    const handle = this.client!.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return {
      startedAt: description.startTime,
      endedAt: description.closeTime ?? null,
    };
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
   *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.4.
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
    // The graph workflow is started with a single positional argument
    // (see `startGraphWorkflow`); the first payload carries the start
    // args object. Narrow strictly: the decoded value must be a non-null
    // object containing an `initialCtx` key whose value is an object.
    // Anything else falls through to the fallback path.
    const decoded = defaultPayloadConverter.fromPayload<unknown>(payloads[0]);
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
   * List workflow execution ids that are currently `Running` for the
   * given `WorkflowLineageId`. Used by the Phase 4 cancel-on-new-Try
   * helper (`WorkflowService.cancelInFlightTriesForLineage`).
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L26,
   *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §5.1.
   *
   * Returns an empty array when no runs match — the visibility-store
   * query is safe to issue against a lineage that's never been Tried.
   *
   * @param workflowLineageId The `WorkflowLineage.id` to filter on.
   * @returns Workflow execution ids of running runs (caller passes
   *          each through `cancelRun`).
   */
  async listRunningInLineage(workflowLineageId: string): Promise<string[]> {
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
    const query = `WorkflowLineageId = "${workflowLineageId}" AND ExecutionStatus = "Running"`;
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
   * Uses the raw `WorkflowService.countWorkflowExecutions` gRPC method
   * (the higher-level `client.workflow.count` helper isn't available in
   * SDK 1.10.x). The visibility-store count is approximate but is the
   * cheapest way to answer "how many runs match this query" — far less
   * I/O than `list` + paginate-count.
   *
   * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L24,
   *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.5.
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
    const query = `WorkflowLineageId = "${workflowLineageId}" AND WorkflowVersionId = "${workflowVersionId}"`;
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
   *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.1.
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

    const clauses: string[] = [`WorkflowLineageId = "${workflowLineageId}"`];
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
   */
  async cancelInFlightTriesForLineage(
    workflowLineageId: string,
  ): Promise<{ cancelledCount: number }> {
    const workflowIds = await this.listRunningInLineage(workflowLineageId);
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
 * Decode `memo.workflowVersion` from a Temporal execution's memo map.
 * Returns `null` when the memo entry is absent or not a number.
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
      payload as temporal.api.common.v1.IPayload & {
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
