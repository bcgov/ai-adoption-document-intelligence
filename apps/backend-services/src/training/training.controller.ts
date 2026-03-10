import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { Identity } from "@/auth/identity.decorator";
import { DatabaseService } from "../database/database.service";
import { LabelingService } from "../labeling/labeling.service";
import { StartTrainingDto } from "./dto/start-training.dto";
import { TrainedModelDto } from "./dto/trained-model.dto";
import {
  CancelJobResponseDto,
  TrainingJobDto,
  ValidationResultDto,
} from "./dto/training-job.dto";
import { TrainingService } from "./training.service";

@ApiTags("Training")
@Controller("api/training")
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly labelingService: LabelingService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Validate if a project is ready for training
   */
  @Get("projects/:projectId/validate")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Validate project training data" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiOkResponse({
    description:
      "Validation result indicating whether the project is ready for training",
    type: ValidationResultDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async validateProject(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.group_id,
      this.databaseService,
    );
    return this.trainingService.validateTrainingData(projectId);
  }

  /**
   * Start training process for a project
   */
  @Post("projects/:projectId/train")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Start model training for a project" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiCreatedResponse({
    description: "Training job created and started",
    type: TrainingJobDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async startTraining(
    @Param("projectId") projectId: string,
    @Body() dto: StartTrainingDto,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.group_id,
      this.databaseService,
    );
    const userId =
      req.user?.sub || (req.user as { id?: string })?.id || "unknown";
    return this.trainingService.startTraining(projectId, dto, userId);
  }

  /**
   * Get all training jobs for a project
   */
  @Get("projects/:projectId/jobs")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get all training jobs for a project" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiOkResponse({
    description: "List of training jobs for the project",
    type: [TrainingJobDto],
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTrainingJobs(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.group_id,
      this.databaseService,
    );
    return this.trainingService.getTrainingJobs(projectId);
  }

  /**
   * Get specific training job status
   */
  @Get("jobs/:jobId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get training job status" })
  @ApiParam({ name: "jobId", description: "Training job ID" })
  @ApiOkResponse({
    description: "Training job details and current status",
    type: TrainingJobDto,
  })
  @ApiNotFoundResponse({ description: "Training job not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getJobStatus(@Param("jobId") jobId: string, @Req() req: Request) {
    const job = await this.trainingService.getTrainingJob(jobId);
    const project = await this.labelingService.getProject(job.projectId);
    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.group_id,
      this.databaseService,
    );
    return job;
  }

  /**
   * Get all trained models for a project
   */
  @Get("projects/:projectId/models")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get trained models for a project" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiOkResponse({
    description: "List of trained models produced from this project",
    type: [TrainedModelDto],
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTrainedModels(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ) {
    const project = await this.labelingService.getProject(projectId);
    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.group_id,
      this.databaseService,
    );
    return this.trainingService.getTrainedModels(projectId);
  }

  /**
   * Cancel a training job
   */
  @Delete("jobs/:jobId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Cancel a training job" })
  @ApiParam({ name: "jobId", description: "Training job ID" })
  @ApiOkResponse({
    description: "Training job cancelled",
    type: CancelJobResponseDto,
  })
  @ApiNotFoundResponse({ description: "Training job not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async cancelJob(@Param("jobId") jobId: string, @Req() req: Request) {
    const job = await this.trainingService.getTrainingJob(jobId);
    const project = await this.labelingService.getProject(job.projectId);
    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.group_id,
      this.databaseService,
    );
    await this.trainingService.cancelTrainingJob(jobId);
    return { success: true, message: "Training job cancelled" };
  }
}
