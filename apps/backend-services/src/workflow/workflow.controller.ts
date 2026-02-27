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
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { getIdentityGroupIds, identityCanAccessGroup } from "@/auth/identity.helpers";
import { DatabaseService } from "@/database/database.service";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import {
  WorkflowListResponseDto,
  WorkflowResponseDto,
} from "./dto/workflow-info.dto";
import { WorkflowInfo, WorkflowService } from "./workflow.service";

@ApiTags("Workflow")
@Controller("api/workflows")
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "List all workflows for the current user's groups" })
  @ApiOkResponse({
    description:
      "Returns the list of workflows belonging to the authenticated user's groups",
    type: WorkflowListResponseDto,
  })
  async getWorkflows(
    @Req() req: Request,
  ): Promise<{ workflows: WorkflowInfo[] }> {
    const groupIds = await getIdentityGroupIds(
      req.resolvedIdentity,
      this.databaseService,
    );

    if (groupIds.length === 0) {
      return { workflows: [] };
    }

    const workflows = await this.workflowService.getGroupWorkflows(groupIds);
    return { workflows };
  }

  @Get(":id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
    const user = req.user;
    const userId = user?.sub as string;

    const workflow = await this.workflowService.getWorkflow(id, userId);

    await identityCanAccessGroup(
      req.resolvedIdentity,
      workflow.groupId,
      this.databaseService,
    );

    return { workflow };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  async createWorkflow(
    @Body() dto: CreateWorkflowDto,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const user = req.user;
    const userId = user?.sub as string;

    await identityCanAccessGroup(
      req.resolvedIdentity,
      dto.groupId,
      this.databaseService,
    );

    const workflow = await this.workflowService.createWorkflow(userId, dto);
    return { workflow };
  }

  @Put(":id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
    const user = req.user;
    const userId = user?.sub as string;

    const existing = await this.workflowService.getWorkflow(id, userId);

    await identityCanAccessGroup(
      req.resolvedIdentity,
      existing.groupId,
      this.databaseService,
    );

    const workflow = await this.workflowService.updateWorkflow(id, userId, dto);
    return { workflow };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete a workflow" })
  @ApiParam({ name: "id", description: "Workflow ID" })
  @ApiNoContentResponse({ description: "Workflow deleted successfully" })
  @ApiNotFoundResponse({ description: "Workflow not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteWorkflow(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    const user = req.user;
    const userId = user?.sub as string;

    const existing = await this.workflowService.getWorkflow(id, userId);

    await identityCanAccessGroup(
      req.resolvedIdentity,
      existing.groupId,
      this.databaseService,
    );

    await this.workflowService.deleteWorkflow(id, userId);
  }
}
