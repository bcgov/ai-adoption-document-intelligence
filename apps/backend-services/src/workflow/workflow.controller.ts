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
import { Request } from "express";
import {
  CreateWorkflowDto,
  WorkflowInfo,
  WorkflowService,
} from "./workflow.service";

@Controller("api/workflows")
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  async getWorkflows(
    @Req() req: Request,
  ): Promise<{ workflows: WorkflowInfo[] }> {
    const user = req.user;
    const userId = user?.sub as string;

    if (!userId) {
      return { workflows: [] };
    }

    const workflows = await this.workflowService.getUserWorkflows(userId);
    return { workflows };
  }

  @Get(":id")
  async getWorkflow(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const user = req.user;
    const userId = user?.sub as string;

    const workflow = await this.workflowService.getWorkflow(id, userId);
    return { workflow };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkflow(
    @Body() dto: CreateWorkflowDto,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const user = req.user;
    const userId = user?.sub as string;

    const workflow = await this.workflowService.createWorkflow(userId, dto);
    return { workflow };
  }

  @Put(":id")
  async updateWorkflow(
    @Param("id") id: string,
    @Body() dto: Partial<CreateWorkflowDto>,
    @Req() req: Request,
  ): Promise<{ workflow: WorkflowInfo }> {
    const user = req.user;
    const userId = user?.sub as string;

    const workflow = await this.workflowService.updateWorkflow(id, userId, dto);
    return { workflow };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkflow(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    const user = req.user;
    const userId = user?.sub as string;

    await this.workflowService.deleteWorkflow(id, userId);
  }
}
