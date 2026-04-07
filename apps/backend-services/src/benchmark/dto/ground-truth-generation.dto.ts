import { GroundTruthJobStatus } from "@generated/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class StartGroundTruthGenerationDto {
  @ApiProperty({
    description:
      "ID of the workflow version (WorkflowVersion.id) to use for OCR processing",
  })
  @IsString()
  @IsNotEmpty()
  workflowVersionId!: string;

  @ApiPropertyOptional({
    description:
      "Optional workflow config overrides keyed by exposed-parameter path (e.g. { 'ctx.modelId': 'prebuilt-layout' }).",
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  workflowConfigOverrides?: Record<string, unknown>;
}

export class GroundTruthJobResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() datasetVersionId!: string;
  @ApiProperty() sampleId!: string;
  @ApiPropertyOptional() documentId?: string | null;
  @ApiProperty() workflowVersionId!: string;
  @ApiPropertyOptional() temporalWorkflowId?: string | null;
  @ApiProperty({ enum: GroundTruthJobStatus }) status!: GroundTruthJobStatus;
  @ApiPropertyOptional() groundTruthPath?: string | null;
  @ApiPropertyOptional() error?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class GroundTruthJobsListResponseDto {
  @ApiProperty({ type: [GroundTruthJobResponseDto] })
  jobs!: GroundTruthJobResponseDto[];

  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class StartGroundTruthGenerationResponseDto {
  @ApiProperty() jobCount!: number;
  @ApiProperty() message!: string;
}

export class GroundTruthReviewQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() original_filename!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() model_id?: string;
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
  @ApiPropertyOptional() ocr_result?: { fields: Record<string, unknown> };
  @ApiPropertyOptional() lastSession?: {
    id: string;
    reviewer_id: string;
    status: string;
    completed_at: Date | null;
    corrections_count: number;
  };
  @ApiProperty() sampleId!: string;
  @ApiProperty() jobId!: string;
}

export class GroundTruthReviewQueueResponseDto {
  @ApiProperty({ type: [GroundTruthReviewQueueItemDto] })
  documents!: GroundTruthReviewQueueItemDto[];

  @ApiProperty() total!: number;
}

export class GroundTruthReviewStatsResponseDto {
  @ApiProperty() totalDocuments!: number;
  @ApiProperty() awaitingReview!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() failed!: number;
}

export class GroundTruthReviewQueueFilterDto {
  @ApiPropertyOptional() limit?: number;
  @ApiPropertyOptional() offset?: number;
  @ApiPropertyOptional() reviewStatus?: "pending" | "reviewed" | "all";
}
