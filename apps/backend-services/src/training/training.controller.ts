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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import {
  CancelJobResponseDto,
  TrainingJobDto,
  ValidationResultDto,
} from "./dto/training-job.dto";
import { TrainedModelDto } from "./dto/trained-model.dto";
import { StartTrainingDto } from "./dto/start-training.dto";
import { TrainingService } from "./training.service";

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@ApiTags("Training")
@Controller("api/training")
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  /**
   * Validate if a project is ready for training
   */
  @Get("projects/:projectId/validate")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Validate project training data" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiOkResponse({
    description: "Validation result indicating whether the project is ready for training",
    type: ValidationResultDto,
  })
  async validateProject(@Param("projectId") projectId: string) {
    return this.trainingService.validateTrainingData(projectId);
  }

  /**
   * Start training process for a project
   */
  @Post("projects/:projectId/train")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Start model training for a project" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiCreatedResponse({
    description: "Training job created and started",
    type: TrainingJobDto,
  })
  async startTraining(
    @Param("projectId") projectId: string,
    @Body() dto: StartTrainingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub || "unknown";
    return this.trainingService.startTraining(projectId, dto, userId);
  }

  /**
   * Get all training jobs for a project
   */
  @Get("projects/:projectId/jobs")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get all training jobs for a project" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiOkResponse({
    description: "List of training jobs for the project",
    type: [TrainingJobDto],
  })
  async getTrainingJobs(@Param("projectId") projectId: string) {
    return this.trainingService.getTrainingJobs(projectId);
  }

  /**
   * Get specific training job status
   */
  @Get("jobs/:jobId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get training job status" })
  @ApiParam({ name: "jobId", description: "Training job ID" })
  @ApiOkResponse({
    description: "Training job details and current status",
    type: TrainingJobDto,
  })
  async getJobStatus(@Param("jobId") jobId: string) {
    return this.trainingService.getTrainingJob(jobId);
  }

  /**
   * Get all trained models for a project
   */
  @Get("projects/:projectId/models")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get trained models for a project" })
  @ApiParam({ name: "projectId", description: "Labeling project ID" })
  @ApiOkResponse({
    description: "List of trained models produced from this project",
    type: [TrainedModelDto],
  })
  async getTrainedModels(@Param("projectId") projectId: string) {
    return this.trainingService.getTrainedModels(projectId);
  }

  /**
   * Cancel a training job
   */
  @Delete("jobs/:jobId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Cancel a training job" })
  @ApiParam({ name: "jobId", description: "Training job ID" })
  @ApiOkResponse({
    description: "Training job cancelled",
    type: CancelJobResponseDto,
  })
  async cancelJob(@Param("jobId") jobId: string) {
    await this.trainingService.cancelTrainingJob(jobId);
    return { success: true, message: "Training job cancelled" };
  }
}
