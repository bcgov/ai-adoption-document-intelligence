import { TrainingStatus } from "@generated/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TrainingJobDto {
  @ApiProperty({ description: "Training job ID" })
  id: string;

  @ApiProperty({ description: "Labeling project ID" })
  projectId: string;

  @ApiProperty({ description: "Training job status", enum: TrainingStatus })
  status: TrainingStatus;

  @ApiProperty({ description: "Azure blob storage container name" })
  containerName: string;

  @ApiPropertyOptional({ description: "SAS URL for blob storage access" })
  sasUrl?: string;

  @ApiProperty({ description: "Number of blobs uploaded for training" })
  blobCount: number;

  @ApiPropertyOptional({
    description: "Azure model ID once training completes",
  })
  modelId?: string;

  @ApiPropertyOptional({ description: "Azure training operation ID" })
  operationId?: string;

  @ApiPropertyOptional({ description: "Error message if training failed" })
  errorMessage?: string;

  @ApiProperty({ description: "When training started" })
  startedAt: Date;

  @ApiPropertyOptional({ description: "When training completed" })
  completedAt?: Date;
}

export class ValidationResultDto {
  @ApiProperty({
    description: "Whether the project has sufficient labeled data for training",
  })
  valid: boolean;

  @ApiProperty({ description: "Number of labeled documents in the project" })
  labeledDocumentsCount: number;

  @ApiProperty({ description: "Minimum number of labeled documents required" })
  minimumRequired: number;

  @ApiProperty({
    description: "List of validation issues preventing training",
    type: [String],
  })
  issues: string[];
}

export class CancelJobResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}
