import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
} from '@nestjs/common';
import { TrainingService } from './training.service';
import { StartTrainingDto } from './dto/start-training.dto';
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from '@/decorators/custom-auth-decorators';

@Controller('api/training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  /**
   * Validate if a project is ready for training
   */
  @Get('projects/:projectId/validate')
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async validateProject(@Param('projectId') projectId: string) {
    return this.trainingService.validateTrainingData(projectId);
  }

  /**
   * Start training process for a project
   */
  @Post('projects/:projectId/train')
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async startTraining(
    @Param('projectId') projectId: string,
    @Body() dto: StartTrainingDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || 'unknown';
    return this.trainingService.startTraining(projectId, dto, userId);
  }

  /**
   * Get all training jobs for a project
   */
  @Get('projects/:projectId/jobs')
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getTrainingJobs(@Param('projectId') projectId: string) {
    return this.trainingService.getTrainingJobs(projectId);
  }

  /**
   * Get specific training job status
   */
  @Get('jobs/:jobId')
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.trainingService.getTrainingJob(jobId);
  }

  /**
   * Get all trained models for a project
   */
  @Get('projects/:projectId/models')
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getTrainedModels(@Param('projectId') projectId: string) {
    return this.trainingService.getTrainedModels(projectId);
  }

  /**
   * Cancel a training job
   */
  @Delete('jobs/:jobId')
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async cancelJob(@Param('jobId') jobId: string) {
    await this.trainingService.cancelTrainingJob(jobId);
    return { success: true, message: 'Training job cancelled' };
  }
}
