import { randomUUID } from "node:crypto";
import { getSourceCatalogEntry, type RunTrigger } from "@ai-di/graph-workflow";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  forwardRef,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { WorkflowNotFoundError } from "@temporalio/client";
import { Request } from "express";
import { AuditService } from "@/audit/audit.service";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { Permission } from "@/auth/role-permissions";
import {
  type ActivityOutputCacheNodeKey,
  ActivityOutputCacheRepository,
} from "@/cache/activity-output-cache.repository";
import { LruTtlCache } from "@/cache/lru-ttl-cache";
import { DocumentDbService } from "@/document/document-db.service";
import { DocumentStatus } from "@/generated";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  type ListRunsExecution,
  TemporalClientService,
  type TemporalExecutionStatusFilter,
} from "@/temporal/temporal-client.service";
import {
  buildRunSpec,
  buildTriggerUrl,
  buildUploadSpec,
} from "./build-run-spec";
import { deriveInputSchema } from "./derive-input-schema";
import { ActivityOutputPreviewDto } from "./dto/activity-output-preview.dto";
import { ActivityOutputPreviewBatchDto } from "./dto/activity-output-preview-batch.dto";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { WorkflowDeleteImpactDto } from "./dto/delete-impact.dto";
import { InputCtxResponseDto } from "./dto/input-ctx-response.dto";
import {
  LIST_RUNS_DEFAULT_LIMIT,
  ListRunsQueryDto,
  ListRunsResponseDto,
  RunSummaryDto,
  type RunSummaryStatus,
} from "./dto/list-runs.dto";
import {
  applyAbortedRunStatus,
  CacheKeyDto,
  hasUnfinishedNodes,
  NODE_STATUSES_RESPONSE_SCHEMA,
  NodeRunStatusDto,
  type NodeStatusesResponseDto,
} from "./dto/node-statuses-response.dto";
import { RunSpecResponseDto } from "./dto/run-spec.dto";
import { SourceUploadResponseDto } from "./dto/source-upload.dto";
import { StartRunRequestDto, StartRunResponseDto } from "./dto/start-run.dto";
import { StartTryRequestDto, StartTryResponseDto } from "./dto/start-try.dto";
import {
  UpdateWorkflowDto,
  WorkflowVersionConflictDto,
} from "./dto/update-workflow.dto";
import { VersionRunCountDto } from "./dto/version-run-count.dto";
import {
  RevertHeadDto,
  WorkflowListResponseDto,
  WorkflowResponseDto,
  WorkflowSaveResponseDto,
  WorkflowVersionListResponseDto,
} from "./dto/workflow-info.dto";
import {
  BlobExcerptBudget,
  PreviewBlobExcerptService,
} from "./preview-blob-excerpt.service";
import { summariseInputCtx } from "./run-history/summarise-input-ctx";
import {
  SourceUploadParameters,
  SourceUploadService,
} from "./source-upload.service";
import { validateRunInput } from "./validate-run-input";
import {
  WorkflowInfo,
  WorkflowKindFilter,
  WorkflowService,
  WorkflowVersionSummary,
} from "./workflow.service";

const ALLOWED_WORKFLOW_KIND_FILTERS: readonly WorkflowKindFilter[] = [
  "workflow",
  "library",
  "all",
];

/**
 * Item 17: maximum number of concurrent `getRunInput` (fetchHistory) RPCs
 * issued when enriching a run-history first page with `inputCtxSummary`.
 * Bounds the fan-out so a full first page (up to `LIST_RUNS_MAX_LIMIT`
 * executions) doesn't hammer Temporal's history service all at once.
 */
export const INPUT_CTX_SUMMARY_CONCURRENCY = 8;

/**
 * Map `items` through `worker` with at most `limit` invocations in flight at
 * any moment, preserving input order in the result. A focused, dependency-free
 * bounded-concurrency runner (the repo has no p-limit-style helper). `worker`
 * is responsible for its own error handling — a rejection propagates and
 * aborts the run (callers that want best-effort semantics catch inside the
 * worker, as `buildInputCtxSummariesForExecutions` does).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  const runOne = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  };

  const runners: Promise<void>[] = [];
  for (let i = 0; i < effectiveLimit; i++) {
    runners.push(runOne());
  }
  await Promise.all(runners);
  return results;
}

/**
 * US-152 — per-process bounded LRU-with-TTL cache for the per-version
 * run-count endpoint. Keyed by `"<workflowId>::<versionId>"`. TTL is 60s
 * — matches the frontend `useVersionRunCount` `staleTime`. Per
 * TRY_IN_PLACE_DESIGN.md §6.5 the cache is intentionally process-local
 * (no Redis): run-count drift between backend instances is acceptable
 * for this UI surface.
 */
export const VERSION_RUN_COUNT_CACHE_TTL_MS = 60_000;

/**
 * Item 16 (resource-bound): hard cap on the number of live entries in the
 * run-count cache. The cache is keyed per `(workflowId, versionId)`, so an
 * unbounded map would grow with the count of distinct versions ever queried
 * across the process lifetime. We cap it and evict least-recently-used
 * entries (plus prune TTL-expired ones on write) so the working set stays
 * bounded regardless of how many versions are browsed.
 */
export const VERSION_RUN_COUNT_CACHE_MAX_ENTRIES = 1_000;

/**
 * Item 9 (security): hard transport-layer ceiling for `source.upload`
 * multipart bodies, in megabytes. The per-source `maxFileSizeMB` is
 * dynamic (resolved from the node's parameters) and still enforced by
 * `SourceUploadService.assertSizeWithinLimit`, but Multer's interceptor
 * limit is static (it's a decorator evaluated at class-load), so we set
 * an absolute upper bound here. A body exceeding this is rejected by
 * Multer BEFORE the whole file is buffered into memory, bounding the
 * resource-exhaustion blast radius. Override via the
 * `WORKFLOW_UPLOAD_MAX_FILE_SIZE_MB` env var.
 */
export const WORKFLOW_UPLOAD_MAX_FILE_SIZE_MB = (() => {
  const raw = process.env.WORKFLOW_UPLOAD_MAX_FILE_SIZE_MB;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
})();

const WORKFLOW_UPLOAD_MAX_FILE_SIZE_BYTES =
  WORKFLOW_UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;

/** A run's decoded start args, as `TemporalClientService.getRunInput` returns them. */
type RunStartArgs = NonNullable<
  Awaited<ReturnType<TemporalClientService["getRunInput"]>>
>;

function buildVersionRunCountCacheKey(
  workflowId: string,
  versionId: string,
): string {
  return `${workflowId}::${versionId}`;
}

function parseWorkflowKindFilter(
  raw: string | undefined,
): WorkflowKindFilter | undefined {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  if ((ALLOWED_WORKFLOW_KIND_FILTERS as readonly string[]).includes(raw)) {
    return raw as WorkflowKindFilter;
  }
  throw new BadRequestException(
    `Invalid 'kind' value. Allowed: ${ALLOWED_WORKFLOW_KIND_FILTERS.join(", ")}`,
  );
}

@ApiTags("Workflow")
@ApiExtraModels(NodeRunStatusDto, CacheKeyDto)
@Controller("api/workflows")
export class WorkflowController {
  /**
   * US-152 — in-process bounded LRU-with-TTL cache backing the per-version
   * run-count endpoint. Lives on the controller instance (NestJS makes the
   * controller a singleton in our app), keyed by `"<workflowId>::<versionId>"`.
   * §6.2: backed by the shared `LruTtlCache` instead of a hand-rolled Map so
   * the recency + TTL + eviction logic isn't duplicated per call site.
   */
  private readonly versionRunCountCache = new LruTtlCache<number>(
    VERSION_RUN_COUNT_CACHE_TTL_MS,
    VERSION_RUN_COUNT_CACHE_MAX_ENTRIES,
  );

  constructor(
    private readonly workflowService: WorkflowService,
    @Inject(forwardRef(() => TemporalClientService))
    private readonly temporalClient: TemporalClientService,
    private readonly logger: AppLoggerService,
    private readonly sourceUploadService: SourceUploadService,
    private readonly activityOutputCache: ActivityOutputCacheRepository,
    private readonly documentDbService: DocumentDbService,
    private readonly auditService: AuditService,
    private readonly previewBlobExcerpt: PreviewBlobExcerptService,
  ) {}

  @Get()
  @Identity({
    allowApiKey: true,
    groupPermissions: {
      groupIdFrom: { query: "groupId" },
      requiredPermissions: [Permission.WORKFLOW_RETRIEVE],
    },
  })
  @ApiOperation({ summary: "List all workflows for the requested group" })
  @ApiQuery({
    name: "groupId",
    required: true,
    description: "Group ID to filter workflows by a specific group",
  })
  @ApiQuery({
    name: "includeBenchmarkCandidates",
    required: false,
    description:
      "When true, include benchmark candidate workflow lineages in the list",
  })
  @ApiQuery({
    name: "kind",
    required: false,
    enum: ["workflow", "library", "all"],
    description:
      "Filter by workflow kind. When set, overrides the default filter (which excludes library workflows). Values: 'workflow' (primary lineages only), 'library' (library workflows only), or 'all' (every kind, still honoring includeBenchmarkCandidates).",
  })
  @ApiOkResponse({
    description:
      "Returns the list of workflows belonging to the authenticated user's groups",
    type: WorkflowListResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid 'kind' query parameter value",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getWorkflows(
    @Query("groupId") groupId: string,
    @Query("includeBenchmarkCandidates")
    includeBenchmarkCandidates: string | undefined,
    @Query("kind") kind: string | undefined,
  ): Promise<{ workflows: WorkflowInfo[] }> {
    const options = {
      includeBenchmarkCandidates: includeBenchmarkCandidates === "true",
      kind: parseWorkflowKindFilter(kind),
    };
    const workflows = await this.workflowService.getGroupWorkflows(
      [groupId],
      options,
    );
    return { workflows };
  }

  @Get(":id/versions")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List immutable versions for a workflow lineage" })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiOkResponse({
    description: "Versions newest-first",
    type: WorkflowVersionListResponseDto,
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listVersions(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<{ versions: WorkflowVersionSummary[] }> {
    const actorId = req.resolvedIdentity.actorId;
    const wf = await this.workflowService.getWorkflow(id, actorId);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);
    const versions = await this.workflowService.listVersions(id);
    return { versions };
  }

  @Get(":id/versions/:versionId")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get a specific WorkflowVersion by id (config + metadata)",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiParam({
    name: "versionId",
    description: "WorkflowVersion.id within this lineage",
  })
  @ApiOkResponse({
    description: "Returns the workflow snapshot at this version",
    type: WorkflowResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      "Workflow or version not found, or version does not belong to this lineage",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getVersion(
    @Param("id") lineageId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const workflow =
      await this.workflowService.getWorkflowVersionById(versionId);
    if (!workflow || workflow.id !== lineageId) {
      throw new NotFoundException(
        `Workflow version not found: ${versionId} in lineage ${lineageId}`,
      );
    }
    identityCanAccessGroup(req.resolvedIdentity, workflow.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);
    return { workflow };
  }

  @Get(":id/versions/:versionId/run-count")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the approximate number of Temporal runs executed against a specific " +
      "(workflowLineageId, workflowVersionId) pair. Drives the run-count badge " +
      "on `VersionHistoryDrawer` (Phase 4 / US-152).",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiParam({
    name: "versionId",
    description: "WorkflowVersion.id within this lineage",
  })
  @ApiOkResponse({
    description:
      "The approximate run count for this version. The value is server-side " +
      "cached per `(workflowId, versionId)` for 60s to bound Temporal " +
      "visibility-store load — first call hits Temporal, subsequent calls " +
      "within the TTL return the cached value.",
    type: VersionRunCountDto,
  })
  @ApiNotFoundResponse({
    description:
      "Workflow or version not found, or version does not belong to this lineage",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getVersionRunCount(
    @Param("id") lineageId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ): Promise<VersionRunCountDto> {
    const workflow =
      await this.workflowService.getWorkflowVersionById(versionId);
    if (!workflow || workflow.id !== lineageId) {
      throw new NotFoundException(
        `Workflow version not found: ${versionId} in lineage ${lineageId}`,
      );
    }
    identityCanAccessGroup(req.resolvedIdentity, workflow.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    const cacheKey = buildVersionRunCountCacheKey(lineageId, versionId);
    const cached = this.versionRunCountCache.get(cacheKey);
    if (cached !== undefined) {
      return { runCount: cached };
    }

    const runCount = await this.temporalClient.countRunsForVersion(
      lineageId,
      versionId,
    );
    this.versionRunCountCache.set(cacheKey, runCount);
    return { runCount };
  }

  @Get(":id/run-spec")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the run-trigger contract for a workflow (URL, input schema, sample curl, auth notes)",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiQuery({
    name: "workflowVersionId",
    required: false,
    description:
      "Specific WorkflowVersion.id to derive the spec from. Defaults to head.",
  })
  @ApiOkResponse({
    description:
      "Run-trigger spec for the workflow. When `workflowVersionId` is omitted, the spec is derived from the lineage's head version. The input schema follows the Phase 8 precedence: source.api → library `metadata.inputs[]` → ctx entries flagged `isInput: true` → empty. When a `source.upload` node is present, the response also includes an `uploadSpec` field carrying the upload URL plus the source's MIME / size constraints.",
    type: RunSpecResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Workflow or workflowVersionId not found",
  })
  @ApiBadRequestResponse({
    description: "workflowVersionId does not belong to this workflow",
  })
  @ApiConflictResponse({ description: "Workflow has no published version yet" })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getRunSpec(
    @Param("id") id: string,
    @Query("workflowVersionId") workflowVersionId: string | undefined,
    @Req() req: Request,
  ): Promise<RunSpecResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(
      id,
      workflowVersionId,
    );
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);
    const triggerUrl = buildTriggerUrl(req, id);
    const runSpec = buildRunSpec(wf.config, triggerUrl);
    const uploadSpec = buildUploadSpec(wf.config);
    // Omit `uploadSpec` entirely when absent (Scenario 2) — do NOT
    // include the key with `undefined`.
    if (uploadSpec) {
      return { ...runSpec, uploadSpec };
    }
    return runSpec;
  }

  @Post(":id/runs")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Trigger a workflow run (Temporal execution)",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiBody({
    type: StartRunRequestDto,
    description:
      "`initialCtx` is validated against the workflow's derived input schema (see `GET /api/workflows/:id/run-spec`). `workflowVersionId` is optional and defaults to the head version.",
  })
  @ApiCreatedResponse({
    description:
      "Run started successfully. Returns the Temporal workflow execution id.",
    type: StartRunResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "Body fails input-schema validation, `workflowVersionId` does not " +
      "belong to this lineage, or the workflow config has validation " +
      "errors and cannot run (draft-save persists invalid configs; run " +
      "start refuses them — `errors` carries the findings).",
  })
  @ApiNotFoundResponse({ description: "Workflow or version not found" })
  @ApiConflictResponse({
    description: "Workflow has no published version yet",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async startRun(
    @Param("id") id: string,
    @Body() body: StartRunRequestDto,
    @Req() req: Request,
  ): Promise<StartRunResponseDto> {
    // G-021: this is the public run API — a production run, not an editor
    // preview. Stamping `"api"` keeps it out of every later cancel set.
    return this.startLineageRun(id, body, req, "api");
  }

  @Post(":id/tries")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Start a canvas Try run (disposable editor preview)",
    description:
      "Same execution path as `POST /:id/runs`, but the run is stamped " +
      '`RunTrigger = "try"` so the next Try for this lineage cancels it. ' +
      "The trigger is assigned server-side and is not a request field: a " +
      "production run started through `/runs` can never be swept up by " +
      "editor activity (D-17).",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiBody({
    type: StartTryRequestDto,
    description:
      "`initialCtx` is validated against the workflow's derived input schema (see `GET /api/workflows/:id/run-spec`). `workflowVersionId` is optional and defaults to the head version.",
  })
  @ApiCreatedResponse({
    description:
      "Try started successfully. Any in-flight Try for this lineage has been cancelled.",
    type: StartTryResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "Body fails input-schema validation, `workflowVersionId` does not " +
      "belong to this lineage, or the workflow config has validation " +
      "errors and cannot run (draft-save persists invalid configs; run " +
      "start refuses them — `errors` carries the findings).",
  })
  @ApiNotFoundResponse({ description: "Workflow or version not found" })
  @ApiConflictResponse({
    description: "Workflow has no published version yet",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async startTry(
    @Param("id") id: string,
    @Body() body: StartTryRequestDto,
    @Req() req: Request,
  ): Promise<StartTryResponseDto> {
    // D-17: the editor's Try button lands here. Before this endpoint existed
    // the canvas started its previews through `/runs`, so every Try was
    // stamped `"api"` and `cancelInFlightTriesForLineage` had nothing to
    // cancel — the cancel-on-new-Try behaviour was dead code in practice.
    return this.startLineageRun(id, body, req, "try");
  }

  /**
   * Shared implementation behind `POST /:id/runs` and `POST /:id/tries`.
   * The two endpoints differ only in the `RunTrigger` they stamp — which is
   * exactly why `trigger` is a parameter here and NOT a field on either DTO.
   */
  private async startLineageRun(
    id: string,
    body: StartRunRequestDto | StartTryRequestDto,
    req: Request,
    trigger: RunTrigger,
  ): Promise<StartRunResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(
      id,
      body.workflowVersionId,
    );
    // A Try is part of editing the workflow; a real run submits work for
    // processing, which is what uploading a document needs too.
    identityCanAccessGroup(
      req.resolvedIdentity,
      wf.groupId,
      trigger === "try"
        ? [Permission.WORKFLOW_UPDATE]
        : [Permission.DOCUMENT_CREATE],
    );

    // Draft-save (2026-08-02): saving no longer refuses an invalid config,
    // so run start is where the D-11 invariant ("a state the runtime cannot
    // satisfy is reported at author time, not run time") is enforced
    // server-side. Warnings don't block; severity-`error` findings do.
    await this.workflowService.assertConfigRunnable(wf.config, wf.groupId);

    const initialCtx = body.initialCtx ?? {};
    const inputSchema = deriveInputSchema(wf.config);
    const errors = validateRunInput(inputSchema, initialCtx);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: "Invalid initialCtx for this workflow's input schema",
        errors,
      });
    }

    // A new Try replaces the previous one: cancel any Try of this workflow
    // that is still running BEFORE starting, so a stale canvas preview
    // doesn't keep running alongside it. Only runs labelled "try" are ever
    // cancelled, and only by another Try. A real run (`/runs`) cancels
    // nothing, or production traffic would keep cancelling whoever is
    // testing the same workflow in the editor. Cancel is best-effort inside
    // the helper (errors are swallowed there), so it never blocks the run.
    if (trigger === "try") {
      await this.temporalClient.cancelInFlightTriesForLineage(id);
    }

    // Item 4 (security): the caller's `x-api-key` is intentionally NOT
    // forwarded into the workflow input. Temporal persists workflow input in
    // durable history, so forwarding it would leak the caller key in
    // cleartext. The worker's `dyn.run` activity injects `AI_DI_API_KEY`
    // as a short-lived internal token minted per invocation, scoped to the
    // workflow's group. This also makes the startRun and upload-and-Try run
    // paths symmetric.
    const { workflowId, runId } = await this.temporalClient.startGraphWorkflow(
      undefined,
      wf.workflowVersionId,
      initialCtx,
      wf.groupId,
      trigger,
    );

    await this.auditService.recordEvent({
      event_type: "workflow_run_started",
      resource_type: "workflow_run",
      resource_id: runId,
      actor_id: req.resolvedIdentity.actorId,
      workflow_execution_id: runId,
      group_id: wf.groupId,
      payload: {
        workflow_config_id: wf.workflowVersionId,
        trigger,
      },
    });

    this.logger.log(
      `Workflow run started: ${workflowId} (run ${runId}, lineage ${id}, version ${wf.workflowVersionId}, trigger ${trigger}, ctx keys: [${Object.keys(initialCtx).join(", ")}])`,
    );

    return {
      workflowId,
      workflowVersionId: wf.workflowVersionId,
      status: "started",
    };
  }

  @Post(":id/sources/:sourceNodeId/upload")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: WORKFLOW_UPLOAD_MAX_FILE_SIZE_BYTES },
    }),
  )
  @ApiOperation({
    summary:
      "Upload a sample file to a `source.upload` node and start a Try run",
    description:
      "For testing a workflow in the editor. Streams the file to blob " +
      "storage, records a Document, and starts a run with the file bound " +
      "to the source's `ctxKey`. The run is labelled `try`, like the " +
      "editor's Try button, so it replaces any Try of this workflow that " +
      "is still running. It is not a way for outside systems to send " +
      "files in as real work.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiParam({
    name: "sourceNodeId",
    description: "ID of the source.upload node within the workflow's graph.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    required: true,
    description:
      "Single `file` part — the file to upload. MIME type and size are " +
      "validated against the source node's configured `allowedMimeTypes` " +
      "and `maxFileSizeMB` parameters.",
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
      },
      required: ["file"],
    },
  })
  @ApiOkResponse({
    description:
      "Upload succeeded and a Temporal Try run was kicked off. The " +
      "response carries a dynamic property whose key is the source's " +
      "configured `ctxKey` (default `documentUrl`) and whose value is " +
      "the blob storage key, alongside fixed properties: `runId` " +
      "(Temporal workflow execution id of the kicked-off run), " +
      "`documentId` (the created Document record, echoed into the run's " +
      "initialCtx), and `workflowVersionId` (the version id used for the " +
      "run — head or pinned, resolved via " +
      "`WorkflowService.resolveLineageAndVersion`).",
    schema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description:
            "Temporal workflow execution id of the run kicked off " +
            "immediately after upload commit (Phase 4 / US-146).",
        },
        documentId: {
          type: "string",
          description:
            "Id of the Document record created for this upload; included " +
            "in the run's initialCtx as `documentId`.",
        },
        workflowVersionId: {
          type: "string",
          description: "`WorkflowVersion.id` used for the kicked-off run.",
        },
      },
      required: ["runId", "documentId", "workflowVersionId"],
      additionalProperties: { type: "string" },
    },
  })
  @ApiBadRequestResponse({
    description:
      "Node is not a `source.upload` subtype, or the file's MIME type " +
      "does not match the source's allowlist, or the request is missing " +
      "the `file` part, or the workflow config has validation errors and " +
      "cannot run (draft-save persists invalid configs; the upload-and-Try " +
      "run start refuses them).",
  })
  @ApiNotFoundResponse({
    description:
      "Workflow not found, OR the workflow exists but the given " +
      "`sourceNodeId` does not resolve to a node within `config.nodes`.",
  })
  @ApiPayloadTooLargeResponse({
    description: "File exceeds the source's configured `maxFileSizeMB` limit.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async uploadToSource(
    @Param("id") workflowId: string,
    @Param("sourceNodeId") sourceNodeId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<SourceUploadResponseDto> {
    if (!file) {
      throw new BadRequestException(
        "Missing file part. POST a `multipart/form-data` body with a single `file` field.",
      );
    }

    const wf = await this.workflowService.resolveLineageAndVersion(workflowId);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_UPDATE,
    ]);

    // Draft-save gate move: same run-start refusal as startLineageRun —
    // upload-and-Try kicks off a run, so an invalid graph is refused BEFORE
    // the file is streamed to blob storage and a Document row is minted.
    await this.workflowService.assertConfigRunnable(wf.config, wf.groupId);

    const node = wf.config.nodes[sourceNodeId];
    if (!node) {
      throw new NotFoundException(
        `Source node not found: \`${sourceNodeId}\` (in workflow ${workflowId})`,
      );
    }
    if (node.type !== "source") {
      throw new BadRequestException(
        `Node \`${sourceNodeId}\` is not a source.upload (got node type \`${node.type}\`)`,
      );
    }
    if (node.sourceType !== "source.upload") {
      throw new BadRequestException(
        `Node \`${sourceNodeId}\` is not a source.upload (got \`${node.sourceType}\`)`,
      );
    }

    const catalogEntry = getSourceCatalogEntry("source.upload");
    if (!catalogEntry) {
      throw new BadRequestException(
        "Source subtype `source.upload` is not registered in the catalog.",
      );
    }
    const resolvedParameters = catalogEntry.parametersSchema.parse(
      node.parameters ?? {},
    ) as SourceUploadParameters;

    const blobKey = await this.sourceUploadService.uploadFileForSource(
      file,
      resolvedParameters,
      wf.groupId,
      workflowId,
      sourceNodeId,
    );

    this.logger.log(
      `Source upload stored: workflow=${workflowId}, source=${sourceNodeId}, ctxKey=${resolvedParameters.ctxKey}, blobKey=${blobKey}`,
    );

    // Create a Document record for the upload so document-processing
    // workflows (OCR: prepare/poll/extract require a `documentId` via
    // `requireDocumentId`; status updates; result storage) have a real
    // document to run against. The graph engine reads `ctx.documentId` from
    // initialCtx (see node-executors.ts — "documentId ... set by the
    // upload/start"). Without this, an OCR workflow run from an ad-hoc
    // upload fails at the first activity that needs the id.
    const document = await this.documentDbService.createDocument({
      id: randomUUID(),
      title: file.originalname,
      original_filename: file.originalname,
      file_path: blobKey,
      normalized_file_path: null,
      file_type: file.mimetype === "application/pdf" ? "pdf" : "image",
      file_size: file.size,
      // No content hash for an ad-hoc builder upload: dedup/lookup by hash is
      // a document-library concern and this record exists only so the graph
      // engine has a `documentId` to run against.
      content_hash: null,
      // No review plan at upload time: it is written later by
      // `hitl.applyReviewCriteria` if the graph runs that activity.
      review_plan: null,
      metadata: {},
      source: "workflow-upload",
      status: DocumentStatus.pre_ocr,
      apim_request_id: null,
      workflow_config_id: wf.workflowVersionId,
      workflow_execution_id: null,
      model_id: "prebuilt-layout",
      group_id: wf.groupId,
    });

    // Phase 4 (US-146): cancel any in-flight Try for this lineage
    // BEFORE starting the new run, so the "cancel-on-new-Try" semantics
    // are enforced server-side. Cancel errors don't block the new run
    // (cancel is best-effort inside the helper; see the service docs).
    await this.temporalClient.cancelInFlightTriesForLineage(workflowId);

    // Kick off a fresh Temporal Try with the uploaded file's ctx
    // reference. The ctx key is the source.upload node's configured
    // `ctxKey`; the value is the blob storage key the upload just
    // produced. `documentId` is included so document-processing activities
    // resolve it from initialCtx. Both are returned to the caller so a
    // client can chain upload → run with one round-trip.
    const initialCtx: Record<string, unknown> = {
      [resolvedParameters.ctxKey]: blobKey,
      documentId: document.id,
    };
    const started = await this.temporalClient.startGraphWorkflow(
      undefined,
      wf.workflowVersionId,
      initialCtx,
      wf.groupId,
      // G-021: upload-and-Try is the canvas preview path, so this run is
      // disposable and the next Try may cancel it.
      "try",
    );

    // Stamp the run id onto the document now that a run exists, as
    // `OcrService` does for API uploads; creation (above) legitimately has
    // none. The column holds the Temporal run id (the billing run id). The
    // review queue resumes a gated run by its workflow id instead,
    // `graph-<documentId>`.
    await this.documentDbService.updateDocument(document.id, {
      workflow_execution_id: started.runId,
    });

    await this.auditService.recordEvent({
      event_type: "workflow_run_started",
      resource_type: "workflow_run",
      resource_id: started.runId,
      actor_id: req.resolvedIdentity.actorId,
      document_id: document.id,
      workflow_execution_id: started.runId,
      group_id: wf.groupId,
      payload: {
        workflow_config_id: wf.workflowVersionId,
        source_node_id: sourceNodeId,
        trigger: "try",
      },
    });

    this.logger.log(
      `Source upload-and-Try started run ${started.workflowId} (run id ${started.runId}, workflow=${workflowId}, version=${wf.workflowVersionId}, documentId=${document.id})`,
    );

    return {
      [resolvedParameters.ctxKey]: blobKey,
      documentId: document.id,
      // The builder API's `runId` is the Temporal workflow id: the id the
      // canvas polls node-statuses and input-ctx with, and that Run history
      // lists. The Temporal run id is only the billing id stored above.
      runId: started.workflowId,
      workflowVersionId: wf.workflowVersionId,
    };
  }

  @Post(":id/revert-head")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Restore an older version: appends its config as a NEW version and points head at it (does not change benchmark definition pins)",
    description:
      "The selected version's config is copied forward as `head.versionNumber + 1`; the source version row is left untouched, so its run history stays attached to it. The response's `workflow.version` is the NEW version number.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiBody({ type: RevertHeadDto })
  @ApiOkResponse({
    description:
      "The lineage with its new head version — `version` is the freshly appended version number, not the restored one.",
    type: WorkflowResponseDto,
  })
  @ApiConflictResponse({
    description:
      "The workflow was changed concurrently and the restore could not claim a version number after retries.",
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiBadRequestResponse({ description: "Version not in lineage" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async revertHead(
    @Param("id") id: string,
    @Body() body: RevertHeadDto,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const actorId = req.resolvedIdentity.actorId;
    const existing = await this.workflowService.getWorkflow(id, actorId);
    identityCanAccessGroup(req.resolvedIdentity, existing.groupId, [
      Permission.WORKFLOW_UPDATE,
    ]);
    const workflow = await this.workflowService.revertHeadToVersion(
      id,
      body.workflowVersionId,
      actorId,
    );
    return { workflow };
  }

  @Get(":id/runs/:runId/node-statuses")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the live per-node run status map for a Temporal run by proxying the `getNodeStatuses` query (Phase 4 try-in-place).",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiParam({
    name: "runId",
    description: "Temporal workflow execution id returned by `POST /:id/runs`",
  })
  // The response body is a record `Record<string, NodeRunStatusDto>` —
  // TypeScript can't decorate an index signature with `@ApiProperty`, so
  // we feed Swagger the raw OpenAPI schema (with `additionalProperties`
  // pointing at the `NodeRunStatusDto` registered via `@ApiExtraModels`).
  @ApiOkResponse({
    description:
      "Per-node status snapshot. Keys are `nodeId`s; absent keys are pending. Polled by the canvas at ~1.5s cadence.",
    schema: NODE_STATUSES_RESPONSE_SCHEMA,
  })
  @ApiNotFoundResponse({
    description:
      "Workflow not found, OR the Temporal `runId` does not resolve to a known execution (never existed / typo), OR the run is not an editor Try run, OR its start args cannot be decoded so its workflow cannot be confirmed. Production (`api`-triggered) runs are refused with the same 404 shape (fail closed); a document submitted for processing is followed on the Documents page instead.",
  })
  @ApiGoneResponse({
    description:
      "The run's history has been retention-cleaned by Temporal. The canvas should fall back to the cached preview endpoint.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({
    description:
      "Access denied: not a group member, OR the `runId` is a Try run of a different workflow lineage (or records none).",
  })
  async getNodeStatuses(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<NodeStatusesResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    const notFound = () => new NotFoundException({ message: "Run not found" });
    try {
      const runInput = await this.resolveTryRunOfLineage(id, runId, notFound);
      if (runInput === null) {
        // The run's start args can't be decoded, so ownership can't be
        // confirmed — fail closed rather than leak another tenant's statuses.
        throw notFound();
      }

      const statuses =
        await this.temporalClient.queryNodeStatuses<NodeRunStatusDto>(runId);

      // G-047: a cancelled run's nodes stay `running` in the query result —
      // cancellation stops the execution before the workflow can write a
      // terminal status — so the canvas never satisfied its all-terminal stop
      // and polled at 1.5 s forever. Ask Temporal what actually happened and
      // report those nodes as `cancelled`.
      //
      // Only when something is still non-terminal: that is exactly the case
      // that would otherwise keep polling, and it keeps the extra describe off
      // the path where the map is already settled.
      if (!hasUnfinishedNodes(statuses)) return statuses;

      const description = await this.temporalClient
        .getWorkflowStatus(runId)
        .catch(() => undefined);
      return applyAbortedRunStatus(statuses, description?.status);
    } catch (error) {
      // Ownership rejections propagate unchanged — never remap to 404/410.
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // Temporal's SDK throws a single `WorkflowNotFoundError` for both
      // "no such run" and "history past retention" — the cases are
      // distinguished only by the gRPC `details` text the server attaches.
      // We split via a message heuristic: messages mentioning history /
      // retention / deleted map to 410 Gone; everything else falls back
      // to 404. Documented gap: a future Temporal Server release could
      // surface a typed detail (e.g. `WorkflowHistoryNotFoundFailure`)
      // that we'd switch on instead.
      if (error instanceof WorkflowNotFoundError) {
        const messageLower = (error.message ?? "").toLowerCase();
        const retentionCleaned =
          /history|retention|deleted|reached.*retention/i.test(messageLower);
        if (retentionCleaned) {
          throw new GoneException({
            message:
              "Run history no longer available — use the cached preview endpoint instead",
          });
        }
        throw new NotFoundException({ message: "Run not found" });
      }
      throw error;
    }
  }

  @Get(":id/preview-cache")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the cached `ActivityOutputCache` row for a node within a workflow lineage (Phase 4 preview-cache read endpoint).",
    description:
      "Without `runId`, returns the most recent fresh (`expiresAt > now`) cache row for `(workflowLineageId, nodeId)`. With `runId`, returns the row the run's own node status names: the run records, for each node a cache row holds the output of, that row's `cacheKey` (`configHash` + `inputHash`), and the row is read by that exact key. So a replay shows the run's own result even when other runs of the workflow ran at the same time, and a step the run was served from cache shows the row it was served. 404 when no fresh row matches.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiQuery({
    name: "nodeId",
    required: true,
    description: "ID of the node within the workflow's graph.",
  })
  @ApiQuery({
    name: "runId",
    required: false,
    description:
      "Optional Temporal workflow execution id of an editor Try run of this workflow. When supplied, returns the row whose key the run's status for `nodeId` records.",
  })
  @ApiOkResponse({
    description:
      "The cached output row, shaped for the preview widget. Cache rows past `expiresAt` are NOT returned even though they may still be in the database until GC — the consumer treats 404 as a cache-evicted state.",
    type: ActivityOutputPreviewDto,
  })
  @ApiNotFoundResponse({
    description:
      "No fresh cache row matches. Body: `{ message: 'No cached output for this node' }`. With `runId`, also returned when the run's status for the node records no cache key (the step did not run, failed, is never cached, or its cache write failed), when the run does not exist, when it is not an editor Try run, or when its start args cannot be decoded so its workflow cannot be confirmed (production runs never resolve cache rows — fail closed).",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({
    description:
      "Access denied: not a group member, OR the `runId` is a Try run of a different workflow lineage (or records none). Body: `{ message: 'Run does not belong to this workflow' }`.",
  })
  async getPreviewCache(
    @Param("id") id: string,
    @Query("nodeId") nodeId: string,
    @Query("runId") runId: string | undefined,
    @Req() req: Request,
  ): Promise<ActivityOutputPreviewDto> {
    if (!nodeId) {
      throw new BadRequestException(
        "`nodeId` query parameter is required for the preview-cache endpoint.",
      );
    }

    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    let row: Awaited<
      ReturnType<ActivityOutputCacheRepository["findMostRecentFresh"]>
    > = null;

    if (runId === undefined || runId === "") {
      row = await this.activityOutputCache.findMostRecentFresh({
        workflowLineageId: id,
        nodeId,
      });
    } else {
      // Same 404 shape as a cache miss for every refusal, so it reveals
      // nothing about the run.
      const notFound = () =>
        new NotFoundException({ message: "No cached output for this node" });
      let keys: ActivityOutputCacheNodeKey[];
      try {
        const runInput = await this.resolveTryRunOfLineage(id, runId, notFound);
        if (runInput === null) {
          // Ownership can't be confirmed from undecodable start args.
          throw notFound();
        }
        keys = await this.readRunCacheKeys(runId);
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          throw notFound();
        }
        throw error;
      }

      const key = keys.find((candidate) => candidate.nodeId === nodeId);
      row =
        key === undefined
          ? null
          : await this.activityOutputCache.findFresh({
              workflowLineageId: id,
              ...key,
            });
    }

    if (row === null) {
      throw new NotFoundException({
        message: "No cached output for this node",
      });
    }

    // G-022: resolve blob-backed values (OcrResult pointers) into bounded
    // excerpts so the preview can show extracted values instead of a blob key.
    const blobExcerpts = await this.previewBlobExcerpt.resolveOutputCtx(
      row.outputCtx,
      wf.groupId,
      new BlobExcerptBudget(),
    );

    return {
      outputCtx: row.outputCtx as Record<string, unknown>,
      outputKind: row.outputKind,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ...(blobExcerpts !== undefined ? { blobExcerpts } : {}),
    };
  }

  @Get(":id/preview-cache-batch")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Batch-read every node's cached `ActivityOutputCache` row for a workflow lineage in one request.",
    description:
      "The batch twin of `GET /:id/preview-cache`. Returns a `nodeId → preview` map for **all** nodes with a fresh cache row, so the editor loads all node previews with one round-trip instead of one request per node (the O(nodes) request storm that tripped the rate limiter). Without `runId`, uses each node's most-recent fresh row. With `runId`, returns the rows the run's own node statuses name: each node a cache row holds the output of records that row's `cacheKey` (`configHash` + `inputHash`), and every row is read by its exact key, so a replay shows the run's own results even when other runs of the workflow ran at the same time, including the rows it was served from cache. Nodes with no fresh row, and nodes whose status records no key, are simply absent from the map — treated by the consumer like the per-node endpoint's 404.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiQuery({
    name: "runId",
    required: false,
    description:
      "Optional Temporal workflow execution id of an editor Try run of this workflow. When supplied, returns the rows the run's node statuses record keys for.",
  })
  @ApiOkResponse({
    description: "Map of nodeId → the node's cached preview row.",
    type: ActivityOutputPreviewBatchDto,
  })
  @ApiNotFoundResponse({
    description:
      "Workflow not found, OR (with `runId`) the run does not exist, is not an editor Try run, or has start args that cannot be decoded so its workflow cannot be confirmed (fail closed). Body for a refused run: `{ message: 'Run not found' }`.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({
    description:
      "Access denied: not a group member, OR the `runId` is a Try run of a different workflow lineage (or records none). Body: `{ message: 'Run does not belong to this workflow' }`.",
  })
  async getPreviewCacheBatch(
    @Param("id") id: string,
    @Query("runId") runId: string | undefined,
    @Req() req: Request,
  ): Promise<ActivityOutputPreviewBatchDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    let rows: Awaited<
      ReturnType<ActivityOutputCacheRepository["findManyMostRecentFresh"]>
    >;

    if (runId === undefined || runId === "") {
      rows = await this.activityOutputCache.findManyMostRecentFresh({
        workflowLineageId: id,
      });
    } else {
      const notFound = () =>
        new NotFoundException({ message: "Run not found" });
      let keys: ActivityOutputCacheNodeKey[];
      try {
        const runInput = await this.resolveTryRunOfLineage(id, runId, notFound);
        if (runInput === null) {
          // Ownership can't be confirmed from undecodable start args.
          throw notFound();
        }
        keys = await this.readRunCacheKeys(runId);
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          throw notFound();
        }
        throw error;
      }

      rows = await this.activityOutputCache.findManyFresh({
        workflowLineageId: id,
        keys,
      });
    }

    // G-022: one dereference budget for the WHOLE batch — the batch covers
    // every node in the lineage, so an OCR-heavy workflow would otherwise
    // issue a blob read per node on every preview poll. Pointers past the cap
    // are reported as `request-limit`, never silently dropped.
    const budget = new BlobExcerptBudget();
    const previews: Record<string, ActivityOutputPreviewDto> = {};
    for (const row of rows) {
      const blobExcerpts = await this.previewBlobExcerpt.resolveOutputCtx(
        row.outputCtx,
        wf.groupId,
        budget,
      );
      previews[row.nodeId] = {
        outputCtx: row.outputCtx as Record<string, unknown>,
        outputKind: row.outputKind,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ...(blobExcerpts !== undefined ? { blobExcerpts } : {}),
      };
    }
    return { previews };
  }

  @Get(":id/runs/:runId/input-ctx")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the historical `initialCtx` for a Temporal run, used by the " +
      'frontend "Re-run" button on an evicted-cache preview (Phase 4 ' +
      "replay re-run support, US-151).",
    description:
      "Resolves the run's input in two passes: (1) decode the " +
      "`WorkflowExecutionStarted` event's payload (the start args " +
      "carrying `initialCtx`); (2) when the run exists but its start " +
      "args cannot be decoded, read the source node's cache row by the " +
      "exact `cacheKey` the run's node status records for it (source " +
      "nodes write `outputCtx === initialCtx`, so the cache row " +
      "preserves the original input). Only editor Try runs of this " +
      "workflow answer: cross-lineage `runId`s return 403; unknown, " +
      "retention-cleaned or production `runId`s return 404.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiParam({
    name: "runId",
    description: "Temporal workflow execution id returned by `POST /:id/runs`",
  })
  @ApiOkResponse({
    description:
      "The historical `initialCtx` JSON. Re-running with the same value " +
      "re-attaches to the same uploaded content (cache-hit on the " +
      "source-node's row) for `source.upload` workflows.",
    type: InputCtxResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      "Workflow not found, OR the run's input can't be reconstructed — the " +
      "run is unknown, its history is retention-cleaned, or its start args " +
      "can't be decoded and no fresh source-node cache row matches the key " +
      "its node status records — OR the run is not an editor Try run " +
      "(production `api`-triggered runs are refused with the same shape, " +
      'fail closed). Body: `{ message: "Input not available — run too ' +
      'old or never captured" }`.',
  })
  @ApiForbiddenResponse({
    description:
      "Caller is not a member of the workflow's group, OR the `runId` " +
      "exists but its start args don't prove it belongs to this workflow " +
      "lineage (a different lineage, or no `workflowLineageId` recorded).",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  async getInputCtx(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<InputCtxResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    const notAvailable = () =>
      new NotFoundException({
        message: "Input not available — run too old or never captured",
      });

    // -------------------------------------------------------------------
    // Primary path: the start args from the run's Temporal history, once
    // the run is confirmed to be a Try run of this lineage.
    // -------------------------------------------------------------------
    let runInput: RunStartArgs | null;
    try {
      runInput = await this.resolveTryRunOfLineage(id, runId, notAvailable);
    } catch (error) {
      // `WorkflowNotFoundError` covers both "no such run" and "history past
      // retention". §3.8: in EITHER case we can't reconstruct THIS run's
      // input — the cache-row fallback below needs the run's node statuses,
      // which Temporal can only answer while it holds the run. Falling back
      // to the lineage's most-recent cache row could replay a DIFFERENT
      // (newer) run's document on "Re-run", so we fail safe with 404
      // ("input not available") rather than return the wrong input.
      if (error instanceof WorkflowNotFoundError) {
        throw notAvailable();
      }
      throw error;
    }

    if (runInput !== null) {
      return { initialCtx: runInput.initialCtx };
    }

    // -------------------------------------------------------------------
    // Fallback path: Temporal has the run but its start args can't be
    // decoded. The source node's cache row holds `outputCtx === initialCtx`
    // (see `apps/temporal/src/cache/source-node-cache.ts`), and the run's
    // node status for the source node records that row's exact key, so the
    // row read back is this run's input and no other run's.
    // -------------------------------------------------------------------
    const sourceNode = Object.values(wf.config.nodes).find(
      (node) => node.type === "source",
    );
    if (sourceNode === undefined) {
      throw notAvailable();
    }

    let keys: ActivityOutputCacheNodeKey[];
    try {
      keys = await this.readRunCacheKeys(runId);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        throw notAvailable();
      }
      throw error;
    }

    const key = keys.find((candidate) => candidate.nodeId === sourceNode.id);
    const row =
      key === undefined
        ? null
        : await this.activityOutputCache.findFresh({
            workflowLineageId: id,
            ...key,
          });
    if (row === null) {
      throw notAvailable();
    }

    return { initialCtx: row.outputCtx as Record<string, unknown> };
  }

  /**
   * The guard every per-run editor endpoint applies before answering for a
   * `runId`: node statuses, both preview-cache reads, and input-ctx. The
   * `runId` comes from the caller and is unbounded, so these endpoints
   * answer for an editor Try run of THIS lineage only.
   *
   * 1. Try runs only. A production run's start args carry document ids and
   *    file names that must not surface in the editor, so the `RunTrigger`
   *    search attribute is read first, from `describe()`, before the start
   *    args are fetched. Anything other than `"try"`, including an absent
   *    attribute, gets `notFound()`: the endpoint's own 404 shape, which
   *    reveals nothing about whether such a run exists.
   * 2. This lineage only. Otherwise a group member could pair their own
   *    workflow id with another tenant's run id. Start args that decode must
   *    name this lineage; anything else (another lineage, or none recorded)
   *    is a 403.
   *
   * Returns the decoded start args, or `null` when the run exists but its
   * start args cannot be decoded. The run's lineage is then unproven: the
   * status and preview endpoints refuse it, and input-ctx falls back to the
   * source node's cache row.
   *
   * Temporal errors (notably `WorkflowNotFoundError`, for an unknown or
   * retention-cleaned run) propagate unchanged, so each endpoint maps them
   * onto its own response.
   */
  private async resolveTryRunOfLineage(
    lineageId: string,
    runId: string,
    notFound: () => NotFoundException,
  ): Promise<RunStartArgs | null> {
    const trigger = await this.temporalClient.getRunTrigger(runId);
    if (trigger !== "try") {
      throw notFound();
    }
    const runInput = await this.temporalClient.getRunInput(runId);
    if (runInput !== null && runInput.workflowLineageId !== lineageId) {
      throw new ForbiddenException({
        message: "Run does not belong to this workflow",
      });
    }
    return runInput;
  }

  /**
   * The cache keys a run's node statuses record: for every node a cache row
   * holds the output of in this run, the key that row was written or served
   * under (`NodeRunStatus.cacheKey`). Reading rows by these exact keys is
   * what ties a preview to its run; the cache table itself has no run
   * column. Temporal errors propagate unchanged.
   */
  private async readRunCacheKeys(
    runId: string,
  ): Promise<ActivityOutputCacheNodeKey[]> {
    const statuses =
      await this.temporalClient.queryNodeStatuses<NodeRunStatusDto>(runId);
    return Object.entries(statuses).flatMap(([nodeId, status]) =>
      status.cacheKey
        ? [
            {
              nodeId,
              configHash: status.cacheKey.configHash,
              inputHash: status.cacheKey.inputHash,
            },
          ]
        : [],
    );
  }

  @Get(":id/runs")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "List historical Temporal executions for a workflow lineage (run history). " +
      "Sources from Temporal's visibility store with cursor pagination + " +
      "status / start-time / version filters (Phase 4 — US-150).",
    description:
      "First page (no `cursor`) includes a compact `inputCtxSummary` per " +
      "row — built by calling `describe()` on each execution and projecting " +
      "the start args through the `summariseInputCtx` helper. Subsequent " +
      "pages omit `inputCtxSummary` to keep pagination cheap (the " +
      "consumer can fetch the full ctx on demand via " +
      "`GET /:id/runs/:runId/input-ctx`). Run history is an editor " +
      'surface: only editor Try runs (`RunTrigger = "try"`) are listed. ' +
      "Production runs, such as a document uploaded for processing or a " +
      "run started through the API, are not listed; a document's " +
      "processing progress is shown on the Documents page.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiOkResponse({
    description:
      "Paginated list of runs newest-first. Pass `nextCursor` as the " +
      "`cursor` query parameter on a follow-up call to fetch the next page.",
    type: ListRunsResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "Query parameters fail validation (e.g. `limit` out of range, " +
      "`status` not in the allowed enum), OR `startedAfter > startedBefore`.",
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listRuns(
    @Param("id") id: string,
    @Query() query: ListRunsQueryDto,
    @Req() req: Request,
  ): Promise<ListRunsResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    // Business-rule check: `ValidationPipe` accepts the dates individually
    // but doesn't enforce ordering between them. Reject inverted ranges
    // with 400 (Scenario 5).
    if (
      query.startedAfter !== undefined &&
      query.startedBefore !== undefined &&
      new Date(query.startedAfter).getTime() >
        new Date(query.startedBefore).getTime()
    ) {
      throw new BadRequestException({
        message: "startedAfter must be before startedBefore",
      });
    }

    const limit = query.limit ?? LIST_RUNS_DEFAULT_LIMIT;
    const temporalStatus = mapDtoStatusToTemporalStatus(query.status);

    const { executions, nextCursor } =
      await this.temporalClient.listRunsForWorkflow({
        workflowLineageId: id,
        status: temporalStatus,
        startedAfter: query.startedAfter,
        startedBefore: query.startedBefore,
        workflowVersionId: query.workflowVersionId,
        pageSize: limit,
        cursor: query.cursor,
      });

    // First-page contract: enrich each execution with a compact
    // `inputCtxSummary` by describing it and walking the start args
    // through `summariseInputCtx`. We keep this strictly first-page (no
    // `cursor` in the request) so that paging through a large lineage
    // doesn't fan out N describe-RPCs per page.
    const isFirstPage = query.cursor === undefined || query.cursor === "";

    const inputCtxSummaries = isFirstPage
      ? await this.buildInputCtxSummariesForExecutions(executions)
      : new Map<string, Record<string, unknown> | undefined>();

    const runs: RunSummaryDto[] = executions.map((execution) => {
      const summary: RunSummaryDto = {
        runId: execution.runId,
        workflowVersionId: execution.workflowVersionId ?? "",
        versionNumber: execution.versionNumber ?? 0,
        status: mapTemporalStatusToDtoStatus(execution.status),
        startedAt: execution.startedAt.toISOString(),
      };
      if (execution.endedAt !== null) {
        summary.endedAt = execution.endedAt.toISOString();
      }
      if (isFirstPage) {
        const ctxSummary = inputCtxSummaries.get(execution.runId);
        if (ctxSummary !== undefined) {
          summary.inputCtxSummary = ctxSummary;
        }
      }
      return summary;
    });

    return { runs, nextCursor };
  }

  /**
   * Build a `runId -> summariseInputCtx(initialCtx)` map for a batch of
   * executions. Issues one `getRunInput` (fetchHistory) call per execution
   * and squashes per-run errors to "no summary" — a 404 (history
   * retention-cleaned or never captured) should not poison the whole page.
   *
   * Item 17: the calls are run with an explicit concurrency cap
   * (`INPUT_CTX_SUMMARY_CONCURRENCY`) rather than a single `Promise.all`
   * fan-out, so a first page of up to `LIST_RUNS_MAX_LIMIT` (200)
   * executions cannot fire 200 fetchHistory RPCs at once.
   *
   * Scoped to first-page consumers only; see `listRuns` for the budget
   * rationale.
   */
  private async buildInputCtxSummariesForExecutions(
    executions: ListRunsExecution[],
  ): Promise<Map<string, Record<string, unknown> | undefined>> {
    const results = await mapWithConcurrency(
      executions,
      INPUT_CTX_SUMMARY_CONCURRENCY,
      async (execution) => {
        try {
          const runInput = await this.temporalClient.getRunInput(
            execution.runId,
          );
          if (runInput === null) {
            return [execution.runId, undefined] as const;
          }
          return [
            execution.runId,
            summariseInputCtx(runInput.initialCtx),
          ] as const;
        } catch {
          // Best-effort: drop the summary for runs whose input we can't
          // resolve (history retention, transient gRPC errors). The row
          // still renders — just without the chip.
          return [execution.runId, undefined] as const;
        }
      },
    );
    return new Map(results);
  }

  @Get("by-slug/:slug")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Resolve a workflow by its stable slug",
    description:
      "Resolves a workflow lineage in the requested group by its URL-friendly `slug` (unique within a group) rather than its churn-prone `id`. Backs stable/shareable editor links: a slug is derived deterministically from the name, so a `/workflows/by-slug/<slug>/edit` link survives reseeds even though the lineage `id` changes.",
  })
  @ApiParam({ name: "slug", description: "Stable workflow slug" })
  @ApiQuery({
    name: "groupId",
    required: true,
    description:
      "Group to resolve the slug in (slugs are unique only within a group)",
  })
  @ApiOkResponse({
    description: "Returns the workflow the slug resolves to",
    type: WorkflowResponseDto,
  })
  @ApiBadRequestResponse({
    description: "The groupId query parameter is missing",
  })
  @ApiNotFoundResponse({
    description: "No workflow with that slug in the requested group",
  })
  @ApiForbiddenResponse({
    description:
      "Access denied: not a member of the group, or the group role cannot read workflows",
  })
  async getWorkflowBySlug(
    @Param("slug") slug: string,
    @Query("groupId") groupId: string | undefined,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    if (!groupId) {
      throw new BadRequestException("groupId query parameter is required");
    }
    identityCanAccessGroup(req.resolvedIdentity, groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    const workflow = await this.workflowService.getWorkflowBySlug(
      slug,
      [groupId],
      req.resolvedIdentity.actorId,
    );
    return { workflow };
  }

  @Get(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get a workflow by ID" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiOkResponse({
    description: "Returns the workflow",
    type: WorkflowResponseDto,
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getWorkflow(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const actorId = req.resolvedIdentity.actorId;

    const workflow = await this.workflowService.getWorkflow(id, actorId);

    identityCanAccessGroup(req.resolvedIdentity, workflow.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    return { workflow };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Create a new workflow" })
  @ApiBody({
    type: CreateWorkflowDto,
    description: "Workflow name, optional description, and graph configuration",
  })
  @ApiCreatedResponse({
    description:
      "Workflow created successfully. Returns the created workflow with id, " +
      "version, and timestamps, plus the validation verdict for the saved " +
      "config — draft-save persists semantically-invalid configs and " +
      "reports their issues here instead of refusing.",
    type: WorkflowSaveResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "Invalid request body, or the config is not structurally storable " +
      "(not an object with a `nodes` map). Semantic validation failures do " +
      "NOT reject the save — they come back in `validation.errors`.",
  })
  @ApiForbiddenResponse({
    description:
      "Not a member of the target group, or role below MEMBER (same as former @Identity minimumRole)",
  })
  async createWorkflow(
    @Body() dto: CreateWorkflowDto,
    @Req() req: Request,
  ): Promise<WorkflowSaveResponseDto> {
    const actorId = req.resolvedIdentity.actorId;

    // Same as @Identity({ groupIdFrom: { body: "groupId" }, minimumRole: MEMBER }):
    // identityCanAccessGroup defaults to MEMBER, but pass explicitly for clarity.
    identityCanAccessGroup(req.resolvedIdentity, dto.groupId, [
      Permission.WORKFLOW_CREATE,
    ]);

    const workflow = await this.workflowService.createWorkflow(actorId, dto);
    const validation = await this.workflowService.validateWorkflowConfig(
      workflow.config,
      workflow.groupId,
    );
    return { workflow, validation };
  }

  @Put(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update an existing workflow" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiBody({
    type: UpdateWorkflowDto,
    description:
      "Workflow data (name, description, and/or config) plus the required `expectedVersion` the edits were based on. Only provided fields are updated.",
  })
  @ApiOkResponse({
    description:
      "Workflow updated successfully. Returns the updated workflow plus the " +
      "validation verdict for the saved config — draft-save persists " +
      "semantically-invalid configs and reports their issues here instead " +
      "of refusing.",
    type: WorkflowSaveResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      "Invalid request body, or the config is not structurally storable " +
      "(not an object with a `nodes` map). Semantic validation failures do " +
      "NOT reject the save — they come back in `validation.errors`.",
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiConflictResponse({
    description:
      "The workflow's head has moved on since `expectedVersion`; another editor saved first. The caller should reload before saving again.",
    type: WorkflowVersionConflictDto,
  })
  async updateWorkflow(
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowDto,
    @Req() req: Request,
  ): Promise<WorkflowSaveResponseDto> {
    const actorId = req.resolvedIdentity.actorId;

    const existing = await this.workflowService.getWorkflow(id, actorId);

    identityCanAccessGroup(req.resolvedIdentity, existing.groupId, [
      Permission.WORKFLOW_UPDATE,
    ]);

    const workflow = await this.workflowService.updateWorkflow(
      id,
      actorId,
      dto,
    );
    const validation = await this.workflowService.validateWorkflowConfig(
      workflow.config,
      workflow.groupId,
    );
    return { workflow, validation };
  }

  @Get(":id/delete-impact")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "What deleting this workflow would take with it",
    description:
      "Deleting a lineage cascades to every version under it. Benchmark definitions and ground-truth jobs are protected by Restrict FKs and block the delete outright; documents are not — their pinned config link is set to NULL, erasing the record of which graph produced them with no error raised. This pre-flight read exists so a confirmation can name that cost. It never blocks the delete.",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiOkResponse({
    description: "Counts of what the delete would affect.",
    type: WorkflowDeleteImpactDto,
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDeleteImpact(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<WorkflowDeleteImpactDto> {
    const actorId = req.resolvedIdentity.actorId;

    const existing = await this.workflowService.getWorkflow(id, actorId);

    identityCanAccessGroup(req.resolvedIdentity, existing.groupId, [
      Permission.WORKFLOW_RETRIEVE,
    ]);

    return this.workflowService.describeDeleteImpact(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a workflow" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiNoContentResponse({ description: "Workflow deleted successfully" })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteWorkflow(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    const actorId = req.resolvedIdentity.actorId;

    const existing = await this.workflowService.getWorkflow(id, actorId);

    identityCanAccessGroup(req.resolvedIdentity, existing.groupId, [
      Permission.WORKFLOW_DELETE,
    ]);

    await this.workflowService.deleteWorkflow(id, actorId);
  }
}

/**
 * Translate the DTO's lowercase status filter into Temporal's enum-name
 * spelling used in visibility queries. Returns `undefined` when no
 * filter is set so callers can omit the `ExecutionStatus` clause.
 *
 * Mapping is intentionally narrow — the DTO only accepts the four
 * statuses the canvas surfaces (`running` / `succeeded` / `failed` /
 * `cancelled`). The DTO's `class-validator` `@IsIn` decorator gates the
 * input before this helper runs, so an unknown value is a programmer
 * error rather than a user-input issue.
 */
function mapDtoStatusToTemporalStatus(
  status: RunSummaryStatus | undefined,
): TemporalExecutionStatusFilter | undefined {
  switch (status) {
    case undefined:
      return undefined;
    case "running":
      return "Running";
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Canceled";
  }
}

/**
 * Inverse mapping for response rendering — Temporal's `Completed` becomes
 * the canvas's `succeeded` etc. `Unknown` (which the decoder uses for
 * statuses outside our narrow set, e.g. `Terminated` / `TimedOut`) is
 * reported as `failed` so the row still renders with a sensible badge
 * instead of being silently dropped.
 */
function mapTemporalStatusToDtoStatus(
  status: TemporalExecutionStatusFilter | "Unknown",
): RunSummaryStatus {
  switch (status) {
    case "Running":
      return "running";
    case "Completed":
      return "succeeded";
    case "Failed":
      return "failed";
    case "Canceled":
      return "cancelled";
    case "Unknown":
      return "failed";
  }
}
