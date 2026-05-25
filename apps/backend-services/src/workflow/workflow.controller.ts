import { getSourceCatalogEntry } from "@ai-di/graph-workflow";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { GroupRole } from "@/generated";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import {
  buildBaseUrl,
  buildRunSpec,
  buildTriggerUrl,
  buildUploadSpec,
} from "./build-run-spec";
import { deriveInputSchema } from "./derive-input-schema";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import {
  CacheHitDto,
  NODE_STATUSES_RESPONSE_SCHEMA,
  NodeRunStatusDto,
  type NodeStatusesResponseDto,
} from "./dto/node-statuses-response.dto";
import { RunSpecResponseDto } from "./dto/run-spec.dto";
import { StartRunRequestDto, StartRunResponseDto } from "./dto/start-run.dto";
import {
  RevertHeadDto,
  WorkflowListResponseDto,
  WorkflowResponseDto,
  WorkflowVersionListResponseDto,
} from "./dto/workflow-info.dto";
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
  constructor(
    private readonly workflowService: WorkflowService,
    @Inject(forwardRef(() => TemporalClientService))
    private readonly temporalClient: TemporalClientService,
    private readonly logger: AppLoggerService,
    private readonly sourceUploadService: SourceUploadService,
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
    @Query("includeBenchmarkCandidates") includeBenchmarkCandidates:
      | string
      | undefined,
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

    const workflowId = await this.temporalClient.startGraphWorkflow(
      undefined,
      wf.workflowVersionId,
      initialCtx,
      wf.groupId,
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
      "Upload succeeded. Response is a single-property object whose " +
      "key is the source's configured `ctxKey` (default `documentUrl`) " +
      "and whose value is the blob storage key. The frontend forwards " +
      "this object verbatim as `initialCtx` in the subsequent " +
      "`POST /runs` call. This endpoint is upload-only — no workflow " +
      "run is triggered by it.",
    schema: {
      type: "object",
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
  ): Promise<Record<string, string>> {
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

    return { [resolvedParameters.ctxKey]: blobKey };
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
