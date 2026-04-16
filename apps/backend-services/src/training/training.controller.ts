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
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { TemplateModelService } from "../template-model/template-model.service";
import { StartTrainingDto } from "./dto/start-training.dto";
import {
  CancelJobResponseDto,
  TrainingJobDto,
  ValidationResultDto,
} from "./dto/training-job.dto";
import { TrainingService } from "./training.service";

@ApiTags("Training")
@Controller("api/template-models")
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly templateModelService: TemplateModelService,
  ) {}

  /**
   * Validate if a template model is ready for training
   */
  @Get(":modelId/training/validate")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Validate template model training data" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiOkResponse({
    description:
      "Validation result indicating whether the template model is ready for training",
    type: ValidationResultDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async validateTrainingData(
    @Param("modelId") modelId: string,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.trainingService.validateTrainingData(modelId);
  }

  /**
   * Start training process for a template model
   */
  @Post(":modelId/training/train")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Start model training for a template model" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiCreatedResponse({
    description: "Training job created and started",
    type: TrainingJobDto,
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async startTraining(
    @Param("modelId") modelId: string,
    @Body() dto: StartTrainingDto,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.trainingService.startTraining(modelId, dto);
  }

  /**
   * Get all training jobs for a template model
   */
  @Get(":modelId/training/jobs")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get all training jobs for a template model" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiOkResponse({
    description: "List of training jobs for the template model",
    type: [TrainingJobDto],
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTrainingJobs(
    @Param("modelId") modelId: string,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.trainingService.getTrainingJobs(modelId);
  }

  /**
   * Get specific training job status
   */
  @Get("training/jobs/:jobId")
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
    const templateModel = await this.templateModelService.getTemplateModel(
      job.templateModelId,
    );
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return job;
  }

  /**
   * Cancel a training job
   */
  @Delete("training/jobs/:jobId")
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
    const templateModel = await this.templateModelService.getTemplateModel(
      job.templateModelId,
    );
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    await this.trainingService.cancelTrainingJob(jobId);
    return { success: true, message: "Training job cancelled" };
  }
}
