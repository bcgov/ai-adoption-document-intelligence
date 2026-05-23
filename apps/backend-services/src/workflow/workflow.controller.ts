import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  forwardRef,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { GroupRole } from "@/generated";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { buildRunSpec, buildTriggerUrl } from "./build-run-spec";
import { deriveInputSchema } from "./derive-input-schema";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { RunSpecResponseDto } from "./dto/run-spec.dto";
import { StartRunRequestDto, StartRunResponseDto } from "./dto/start-run.dto";
import {
  RevertHeadDto,
  WorkflowListResponseDto,
  WorkflowResponseDto,
  WorkflowVersionListResponseDto,
} from "./dto/workflow-info.dto";
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
@Controller("api/workflows")
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    @Inject(forwardRef(() => TemporalClientService))
    private readonly temporalClient: TemporalClientService,
    private readonly logger: AppLoggerService,
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
    enum: ["workflow", "library"],
    description:
      "Filter by workflow kind. When set, overrides the default filter (which excludes library workflows). Values: 'workflow' (primary lineages only) or 'library' (library workflows only).",
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

  @Get(":id/run-spec")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get the run-trigger contract for a workflow (URL, input schema, sample curl, auth notes)",
  })
  @ApiParam({ name: "id", description: "Workflow lineage ID" })
  @ApiOkResponse({
    description:
      "Run-trigger spec for the workflow's head version. Library workflows derive their input schema from `metadata.inputs[]`; regular workflows derive it from ctx entries flagged `isInput: true`.",
    type: RunSpecResponseDto,
  })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiConflictResponse({ description: "Workflow has no published version yet" })
  @ApiUnauthorizedResponse({ description: "Authentication required" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getRunSpec(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<RunSpecResponseDto> {
    const wf = await this.workflowService.resolveLineageAndVersion(id);
    identityCanAccessGroup(req.resolvedIdentity, wf.groupId, GroupRole.MEMBER);
    const triggerUrl = buildTriggerUrl(req, id);
    return buildRunSpec(wf.config, triggerUrl);
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
