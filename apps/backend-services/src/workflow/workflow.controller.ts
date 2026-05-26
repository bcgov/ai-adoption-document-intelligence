import { getSourceCatalogEntry } from "@ai-di/graph-workflow";
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
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { ActivityOutputCacheRepository } from "@/cache/activity-output-cache.repository";
import { GroupRole } from "@/generated";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  type ListRunsExecution,
  TemporalClientService,
  type TemporalExecutionStatusFilter,
} from "@/temporal/temporal-client.service";
import {
  buildBaseUrl,
  buildRunSpec,
  buildTriggerUrl,
  buildUploadSpec,
} from "./build-run-spec";
import { deriveInputSchema } from "./derive-input-schema";
import { ActivityOutputPreviewDto } from "./dto/activity-output-preview.dto";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { InputCtxResponseDto } from "./dto/input-ctx-response.dto";
import {
  LIST_RUNS_DEFAULT_LIMIT,
  ListRunsQueryDto,
  ListRunsResponseDto,
  RunSummaryDto,
  type RunSummaryStatus,
} from "./dto/list-runs.dto";
import {
  CacheHitDto,
  NODE_STATUSES_RESPONSE_SCHEMA,
  NodeRunStatusDto,
  type NodeStatusesResponseDto,
} from "./dto/node-statuses-response.dto";
import { RunSpecResponseDto } from "./dto/run-spec.dto";
import { SourceUploadResponseDto } from "./dto/source-upload.dto";
import { StartRunRequestDto, StartRunResponseDto } from "./dto/start-run.dto";
import { VersionRunCountDto } from "./dto/version-run-count.dto";
import {
  RevertHeadDto,
  WorkflowListResponseDto,
  WorkflowResponseDto,
  WorkflowVersionListResponseDto,
} from "./dto/workflow-info.dto";
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
 * US-152 — per-process LRU-with-TTL cache for the per-version
 * run-count endpoint. Keyed by `"<workflowId>::<versionId>"`. TTL is 60s
 * — matches the frontend `useVersionRunCount` `staleTime`. Per
 * TRY_IN_PLACE_DESIGN.md §6.5 the cache is intentionally process-local
 * (no Redis): run-count drift between backend instances is acceptable
 * for this UI surface.
 */
export const VERSION_RUN_COUNT_CACHE_TTL_MS = 60_000;

interface VersionRunCountCacheEntry {
  count: number;
  cachedAt: number;
}

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
@ApiExtraModels(NodeRunStatusDto, CacheHitDto)
@Controller("api/workflows")
export class WorkflowController {
  /**
   * US-152 — in-process LRU-with-TTL cache backing the per-version
   * run-count endpoint. Lives on the controller instance (NestJS makes
   * the controller a singleton in our app), keyed by
   * `"<workflowId>::<versionId>"`. Entries past
   * `VERSION_RUN_COUNT_CACHE_TTL_MS` are recomputed on next read.
   */
  private readonly versionRunCountCache = new Map<
    string,
    VersionRunCountCacheEntry
  >();

  constructor(
    private readonly workflowService: WorkflowService,
    @Inject(forwardRef(() => TemporalClientService))
    private readonly temporalClient: TemporalClientService,
    private readonly logger: AppLoggerService,
    private readonly sourceUploadService: SourceUploadService,
    private readonly activityOutputCache: ActivityOutputCacheRepository,
  ) {}

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List all workflows for the current user's groups" })
  @ApiQuery({
    name: "groupId",
    required: false,
    description: "Optional group ID to filter workflows by a specific group",
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
    @Query("groupId") groupId: string | undefined,
    @Query("includeBenchmarkCandidates")
    includeBenchmarkCandidates: string | undefined,
    @Query("kind") kind: string | undefined,
    @Req() req: Request,
  ): Promise<{ workflows: WorkflowInfo[] }> {
    const options = {
      includeBenchmarkCandidates: includeBenchmarkCandidates === "true",
      kind: parseWorkflowKindFilter(kind),
    };
    if (groupId) {
      identityCanAccessGroup(req.resolvedIdentity, groupId, GroupRole.MEMBER);
      const workflows = await this.workflowService.getGroupWorkflows(
        [groupId],
        options,
      );
      return { workflows };
    }

    const groupIds = getIdentityGroupIds(req.resolvedIdentity);

    if (groupIds === undefined) {
      const workflows =
        await this.workflowService.getAllWorkflowLineages(options);
      return { workflows };
    }

    if (groupIds.length === 0) {
      return { workflows: [] };
    }

    const workflows = await this.workflowService.getGroupWorkflows(
      groupIds,
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
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);
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
    identityCanAccessGroup(
      req.resolvedIdentity,
      workflow.groupId,
      GroupRole.MEMBER,
    );
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
    identityCanAccessGroup(
      req.resolvedIdentity,
      workflow.groupId,
      GroupRole.MEMBER,
    );

    const cacheKey = buildVersionRunCountCacheKey(lineageId, versionId);
    const now = Date.now();
    const cached = this.versionRunCountCache.get(cacheKey);
    if (cached && now - cached.cachedAt < VERSION_RUN_COUNT_CACHE_TTL_MS) {
      return { runCount: cached.count };
    }

    const runCount = await this.temporalClient.countRunsForVersion(
      lineageId,
      versionId,
    );
    this.versionRunCountCache.set(cacheKey, { count: runCount, cachedAt: now });
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
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);
    const triggerUrl = buildTriggerUrl(req, id);
    const runSpec = buildRunSpec(wf.config, triggerUrl);
    const uploadSpec = buildUploadSpec(wf.config, id, buildBaseUrl(req));
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
      "Body fails input-schema validation, or `workflowVersionId` does not belong to this lineage.",
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
    const wf = await this.workflowService.resolveLineageAndVersion(
      id,
      body.workflowVersionId,
    );
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);

    const initialCtx = body.initialCtx ?? {};
    const inputSchema = deriveInputSchema(wf.config);
    const errors = validateRunInput(inputSchema, initialCtx);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: "Invalid initialCtx for this workflow's input schema",
        errors,
      });
    }

    // Phase 4 (US-149): cancel any in-flight Try for this lineage BEFORE
    // starting the new run. Mirrors the upload-and-Try semantics added in
    // US-146 — every new run (whether triggered from the canvas Try tab
    // or from an external API caller) wins over a stale in-flight one.
    // Cancel is best-effort inside the helper (errors are swallowed there),
    // so this never blocks the new run.
    await this.temporalClient.cancelInFlightTriesForLineage(id);

    // Phase 6 (sweep follow-on #1): forward the caller's x-api-key so the
    // worker's dyn.run activity can inject it as AI_DI_API_KEY for scripts
    // that call back into the platform.
    const rawApiKey = req.headers["x-api-key"];
    const apiKey =
      typeof rawApiKey === "string"
        ? rawApiKey
        : Array.isArray(rawApiKey)
          ? rawApiKey[0]
          : undefined;

    const workflowId = await this.temporalClient.startGraphWorkflow(
      undefined,
      wf.workflowVersionId,
      initialCtx,
      wf.groupId,
      undefined,
      apiKey,
    );

    this.logger.log(
      `Workflow run started: ${workflowId} (lineage ${id}, version ${wf.workflowVersionId}, ctx keys: [${Object.keys(initialCtx).join(", ")}])`,
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
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary:
      "Upload a file to a `source.upload` node. Streams to blob storage " +
      "and returns the ctxKey-keyed reference for the subsequent /runs call.",
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
      "the blob storage key, alongside two fixed properties: `runId` " +
      "(Temporal workflow execution id of the kicked-off run) and " +
      "`workflowVersionId` (the version id used for the run — head or " +
      "pinned, resolved via `WorkflowService.resolveLineageAndVersion`).",
    schema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description:
            "Temporal workflow execution id of the run kicked off " +
            "immediately after upload commit (Phase 4 / US-146).",
        },
        workflowVersionId: {
          type: "string",
          description: "`WorkflowVersion.id` used for the kicked-off run.",
        },
      },
      required: ["runId", "workflowVersionId"],
      additionalProperties: { type: "string" },
    },
  })
  @ApiBadRequestResponse({
    description:
      "Node is not a `source.upload` subtype, or the file's MIME type " +
      "does not match the source's allowlist, or the request is missing " +
      "the `file` part.",
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
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);

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

    // Phase 4 (US-146): cancel any in-flight Try for this lineage
    // BEFORE starting the new run, so the "cancel-on-new-Try" semantics
    // are enforced server-side. Cancel errors don't block the new run
    // (cancel is best-effort inside the helper; see the service docs).
    await this.temporalClient.cancelInFlightTriesForLineage(workflowId);

    // Kick off a fresh Temporal Try with the uploaded file's ctx
    // reference. The ctx key is the source.upload node's configured
    // `ctxKey`; the value is the blob storage key the upload just
    // produced. The same blob key is also returned to the caller via
    // the dynamic ctxKey-keyed property so the frontend can chain
    // upload → run with one round-trip.
    const initialCtx: Record<string, unknown> = {
      [resolvedParameters.ctxKey]: blobKey,
    };
    const runId = await this.temporalClient.startGraphWorkflow(
      undefined,
      wf.workflowVersionId,
      initialCtx,
      wf.groupId,
    );

    this.logger.log(
      `Source upload-and-Try started run ${runId} (workflow=${workflowId}, version=${wf.workflowVersionId})`,
    );

    return {
      [resolvedParameters.ctxKey]: blobKey,
      runId,
      workflowVersionId: wf.workflowVersionId,
    };
  }

  @Post(":id/revert-head")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Set lineage head to an existing version (defaults for new work; does not change benchmark definition pins)",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiBody({ type: RevertHeadDto })
  @ApiOkResponse({ type: WorkflowResponseDto })
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
    identityCanAccessGroup(
      req.resolvedIdentity,
      existing.groupId,
      GroupRole.MEMBER,
    );
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
      "Workflow not found, OR the Temporal `runId` does not resolve to a known execution (never existed / typo).",
  })
  @ApiGoneResponse({
    description:
      "The run's history has been retention-cleaned by Temporal. The canvas should fall back to the cached preview endpoint.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getNodeStatuses(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<NodeStatusesResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);

    try {
      const statuses = await this.temporalClient.queryNodeStatuses(runId);
      return statuses as NodeStatusesResponseDto;
    } catch (error) {
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
      "Without `runId`, returns the most recent fresh (`expiresAt > now`) cache row for `(workflowLineageId, nodeId)`. With `runId`, returns the row whose `createdAt` falls within the run's execution window (with a 5s slack on the upper bound). 404 when no fresh row matches.",
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
      "Optional Temporal workflow execution id. When supplied, scopes the lookup to the row written during that run's execution window.",
  })
  @ApiOkResponse({
    description:
      "The cached output row, shaped for the preview widget. Cache rows past `expiresAt` are NOT returned even though they may still be in the database until GC — the consumer treats 404 as a cache-evicted state.",
    type: ActivityOutputPreviewDto,
  })
  @ApiNotFoundResponse({
    description:
      "No fresh cache row matches. Body: `{ message: 'No cached output for this node' }`. Also returned when `runId` points to a non-existent Temporal execution.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
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
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);

    let row: Awaited<
      ReturnType<ActivityOutputCacheRepository["findMostRecentFresh"]>
    > = null;

    if (runId === undefined || runId === "") {
      row = await this.activityOutputCache.findMostRecentFresh({
        workflowLineageId: id,
        nodeId,
      });
    } else {
      let window: { startedAt: Date; endedAt: Date | null };
      try {
        window = await this.temporalClient.getRunWindow(runId);
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          throw new NotFoundException({
            message: "No cached output for this node",
          });
        }
        throw error;
      }

      row = await this.activityOutputCache.findInRunWindow({
        workflowLineageId: id,
        nodeId,
        startedAt: window.startedAt,
        endedAt: window.endedAt ?? new Date(),
      });
    }

    if (row === null) {
      throw new NotFoundException({
        message: "No cached output for this node",
      });
    }

    return {
      outputCtx: row.outputCtx as Record<string, unknown>,
      outputKind: row.outputKind,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
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
      "carrying `initialCtx`); (2) when Temporal's history is " +
      "retention-cleaned or the payload is missing, fall back to the " +
      "source-node's cache row from the run's execution window " +
      "(source nodes write `outputCtx === initialCtx`, so the cache " +
      "row preserves the original input). Cross-lineage `runId`s " +
      "return 403; unknown / fully-evicted `runId`s return 404.",
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
      "Workflow not found, OR neither Temporal nor the cache row carry " +
      "the run's `initialCtx` (body: `{ message: \"Input not " +
      'available — run too old or never captured" }`).',
  })
  @ApiForbiddenResponse({
    description:
      "Caller is not a member of the workflow's group, OR the `runId` " +
      "exists but belongs to a different workflow lineage.",
  })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  async getInputCtx(
    @Param("id") id: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<InputCtxResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);

    // -------------------------------------------------------------------
    // Primary path: pull the start args from the run's Temporal history.
    // -------------------------------------------------------------------
    let runInput: Awaited<ReturnType<TemporalClientService["getRunInput"]>> =
      null;
    let historyMissing = false;
    try {
      runInput = await this.temporalClient.getRunInput(runId);
    } catch (error) {
      // `WorkflowNotFoundError` covers both "no such run" and
      // "history past retention" — for the unknown case we surface 404
      // immediately (the cache-row fallback also requires the run window
      // from Temporal to scope correctly, which we won't have).
      // Retention-cleaned histories still warrant the cache fallback, so
      // they're funneled through the same path as a `null` result below.
      if (error instanceof WorkflowNotFoundError) {
        const messageLower = (error.message ?? "").toLowerCase();
        const retentionCleaned =
          /history|retention|deleted|reached.*retention/i.test(messageLower);
        if (!retentionCleaned) {
          throw new NotFoundException({
            message: "Input not available — run too old or never captured",
          });
        }
        historyMissing = true;
      } else {
        throw error;
      }
    }

    if (runInput !== null) {
      // Cross-lineage check — the runId resolved but the start args
      // recorded a different lineage. Mirrors the `WorkflowLineageId`
      // search-attribute contract set by `startGraphWorkflow`.
      if (
        runInput.workflowLineageId !== null &&
        runInput.workflowLineageId !== id
      ) {
        throw new ForbiddenException({
          message: "Run does not belong to this workflow",
        });
      }
      return { initialCtx: runInput.initialCtx };
    }

    // -------------------------------------------------------------------
    // Fallback path: source-node cache row inside the run's window.
    //
    // Source nodes write `outputCtx === initialCtx` (see
    // `apps/temporal/src/cache/source-node-cache.ts`), so the cache row
    // is a faithful reconstruction of the start args even when Temporal
    // no longer has them.
    // -------------------------------------------------------------------
    const sourceNode = Object.values(wf.config.nodes).find(
      (node) => node.type === "source",
    );

    let row: Awaited<
      ReturnType<ActivityOutputCacheRepository["findInRunWindow"]>
    > = null;

    if (sourceNode !== undefined) {
      if (historyMissing) {
        // Without the run's execution window we can't scope the cache
        // lookup. Fall back to the most-recent fresh row for the source
        // node — TTL filtering still bounds blast radius and the cache
        // is per-lineage, so a stale row would have to come from the
        // same lineage.
        row = await this.activityOutputCache.findMostRecentFresh({
          workflowLineageId: id,
          nodeId: sourceNode.id,
        });
      } else {
        let window: { startedAt: Date; endedAt: Date | null };
        try {
          window = await this.temporalClient.getRunWindow(runId);
        } catch (error) {
          if (error instanceof WorkflowNotFoundError) {
            throw new NotFoundException({
              message: "Input not available — run too old or never captured",
            });
          }
          throw error;
        }

        row = await this.activityOutputCache.findInRunWindow({
          workflowLineageId: id,
          nodeId: sourceNode.id,
          startedAt: window.startedAt,
          endedAt: window.endedAt ?? new Date(),
        });
      }
    }

    if (row === null) {
      throw new NotFoundException({
        message: "Input not available — run too old or never captured",
      });
    }

    return { initialCtx: row.outputCtx as Record<string, unknown> };
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
      "`GET /:id/runs/:runId/input-ctx`).",
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
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);

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
   * executions. Issues one `getRunInput` call per execution and squashes
   * per-run errors to "no summary" — a 404 (history retention-cleaned or
   * never captured) should not poison the whole page. Concurrency is
   * bounded by Temporal's gRPC pool, which the SDK manages internally.
   *
   * Scoped to first-page consumers only; see `listRuns` for the budget
   * rationale.
   */
  private async buildInputCtxSummariesForExecutions(
    executions: ListRunsExecution[],
  ): Promise<Map<string, Record<string, unknown> | undefined>> {
    const results = await Promise.all(
      executions.map(async (execution) => {
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
      }),
    );
    return new Map(results);
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

    identityCanAccessGroup(
      req.resolvedIdentity,
      workflow.groupId,
      GroupRole.MEMBER,
    );

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
      "Workflow created successfully. Returns the created workflow with id, version, and timestamps.",
    type: WorkflowResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid request body or workflow config validation failed",
  })
  @ApiForbiddenResponse({
    description:
      "Not a member of the target group, or role below MEMBER (same as former @Identity minimumRole)",
  })
  async createWorkflow(
    @Body() dto: CreateWorkflowDto,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const actorId = req.resolvedIdentity.actorId;

    // Same as @Identity({ groupIdFrom: { body: "groupId" }, minimumRole: MEMBER }):
    // identityCanAccessGroup defaults to MEMBER, but pass explicitly for clarity.
    identityCanAccessGroup(req.resolvedIdentity, dto.groupId, GroupRole.MEMBER);

    const workflow = await this.workflowService.createWorkflow(actorId, dto);
    return { workflow };
  }

  @Put(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update an existing workflow" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiBody({
    type: CreateWorkflowDto,
    description:
      "Partial workflow data (name, description, and/or config). Only provided fields are updated.",
  })
  @ApiOkResponse({
    description: "Workflow updated successfully. Returns the updated workflow.",
    type: WorkflowResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid request body or workflow config validation failed",
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async updateWorkflow(
    @Param("id") id: string,
    @Body() dto: Partial<CreateWorkflowDto>,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const actorId = req.resolvedIdentity.actorId;

    const existing = await this.workflowService.getWorkflow(id, actorId);

    identityCanAccessGroup(
      req.resolvedIdentity,
      existing.groupId,
      GroupRole.MEMBER,
    );

    const workflow = await this.workflowService.updateWorkflow(
      id,
      actorId,
      dto,
    );
    return { workflow };
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

    identityCanAccessGroup(
      req.resolvedIdentity,
      existing.groupId,
      GroupRole.MEMBER,
    );

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
