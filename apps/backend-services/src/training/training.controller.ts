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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { TemplateModelService } from "../template-model/template-model.service";
import { StartTrainingDto } from "./dto/start-training.dto";
import {
  TrainedModelDto,
  TrainedModelSnapshotDto,
} from "./dto/trained-model.dto";
import { TrainingInfoDto } from "./dto/training-info.dto";
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
   * Get Azure Document Intelligence resource info (region, neural quota).
   * Not group-scoped — the response only exposes Azure-resource-level metadata.
   */
  @Get("training/info")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Get Azure Document Intelligence resource info (region, neural quota)",
  })
  @ApiOkResponse({
    description:
      "Region and quota information from Azure Document Intelligence /info",
    type: TrainingInfoDto,
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  async getTrainingInfo() {
    return this.trainingService.getTrainingInfo();
  }

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
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
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
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
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
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
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
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
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
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
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

  /**
   * List trained versions for a template model (including tombstoned).
   */
  @Get(":modelId/training/versions")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List trained versions for a template model" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiOkResponse({
    description: "Trained versions ordered newest-first",
    type: [TrainedModelDto],
  })
  @ApiNotFoundResponse({ description: "Template model not found" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listTrainedVersions(
    @Param("modelId") modelId: string,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.trainingService.listTrainedVersions(modelId);
  }

  /**
   * Get the dataset snapshot for a specific trained version.
   */
  @Get(":modelId/training/versions/:versionId/snapshot")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get the dataset snapshot for a trained version" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiParam({ name: "versionId", description: "TrainedModel record ID" })
  @ApiOkResponse({
    description:
      "Snapshot of labeled documents and labels at training time, or null for legacy versions",
    type: TrainedModelSnapshotDto,
  })
  @ApiNotFoundResponse({
    description: "Template model or trained version not found",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getTrainedVersionSnapshot(
    @Param("modelId") modelId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    const snapshot = await this.trainingService.getTrainedVersionSnapshot(
      modelId,
      versionId,
    );
    return snapshot ?? { documents: [] };
  }

  /**
   * Set a trained version as the active one for its template.
   */
  @Post(":modelId/training/versions/:versionId/activate")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Set the active trained version for a template" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiParam({ name: "versionId", description: "TrainedModel record ID" })
  @ApiOkResponse({
    description: "Newly active trained version",
    type: TrainedModelDto,
  })
  @ApiNotFoundResponse({
    description: "Template model or trained version not found",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async setActiveTrainedVersion(
    @Param("modelId") modelId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.trainingService.setActiveTrainedVersion(modelId, versionId);
  }

  /**
   * Tombstone a trained version (with guardrails).
   */
  @Delete(":modelId/training/versions/:versionId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete (tombstone) a trained version" })
  @ApiParam({ name: "modelId", description: "Template model ID" })
  @ApiParam({ name: "versionId", description: "TrainedModel record ID" })
  @ApiOkResponse({
    description: "Tombstoned trained version",
    type: TrainedModelDto,
  })
  @ApiNotFoundResponse({
    description: "Template model or trained version not found",
  })
  @ApiConflictResponse({
    description:
      "Version is currently active or referenced by a benchmark definition",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid credentials" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteTrainedVersion(
    @Param("modelId") modelId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ) {
    const templateModel =
      await this.templateModelService.getTemplateModel(modelId);
    identityCanAccessGroup(req.resolvedIdentity, templateModel.group_id);
    return this.trainingService.deleteTrainedVersion(modelId, versionId);
  }
}
