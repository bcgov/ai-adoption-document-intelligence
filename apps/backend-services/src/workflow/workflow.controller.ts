import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { Permission } from "@/auth/role-permissions";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import {
  RevertHeadDto,
  WorkflowListResponseDto,
  WorkflowResponseDto,
  WorkflowVersionListResponseDto,
} from "./dto/workflow-info.dto";
import {
  WorkflowInfo,
  WorkflowService,
  WorkflowVersionSummary,
} from "./workflow.service";

@ApiTags("Workflow")
@Controller("api/workflows")
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

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
  @ApiOkResponse({
    description:
      "Returns the list of workflows belonging to the authenticated user's groups",
    type: WorkflowListResponseDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getWorkflows(
    @Query("groupId") groupId: string,
    @Query("includeBenchmarkCandidates") includeBenchmarkCandidates:
      | string
      | undefined,
  ): Promise<{ workflows: WorkflowInfo[] }> {
    const includeCandidates = includeBenchmarkCandidates === "true";
    const workflows = await this.workflowService.getGroupWorkflows(
      [groupId],
      includeCandidates,
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
    identityCanAccessGroup(req.resolvedIdentity, dto.groupId, [
      Permission.WORKFLOW_CREATE,
    ]);

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

    identityCanAccessGroup(req.resolvedIdentity, existing.groupId, [
      Permission.WORKFLOW_UPDATE,
    ]);

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

    identityCanAccessGroup(req.resolvedIdentity, existing.groupId, [
      Permission.WORKFLOW_DELETE,
    ]);

    await this.workflowService.deleteWorkflow(id, actorId);
  }
}
