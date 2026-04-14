/**
 * DTOs for OCR improvement pipeline generate endpoint.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class OcrImprovementGenerateDto {
  @ApiPropertyOptional({
    description:
      'Force emptyValueCoercion on every ocr.normalizeFields node ("none" | "blank" | "null")',
    enum: ["none", "blank", "null"],
  })
  @IsOptional()
  @IsIn(["none", "blank", "null"])
  normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
}

export class OcrImprovementRecommendationsSummaryDto {
  @ApiProperty({
    description: "Number of recommendations applied to the graph",
  })
  applied: number;

  @ApiProperty({ description: "Number of recommendations rejected" })
  rejected: number;

  @ApiProperty({ description: "Tool IDs applied", type: [String] })
  toolIds: string[];
}

export class OcrImprovementGenerateResponseDto {
  @ApiProperty({ description: "Candidate workflow version ID" })
  candidateWorkflowVersionId: string;

  @ApiProperty({ description: "Candidate workflow lineage ID" })
  candidateLineageId: string;

  @ApiProperty({ type: () => OcrImprovementRecommendationsSummaryDto })
  recommendationsSummary: OcrImprovementRecommendationsSummaryDto;

  @ApiPropertyOptional({ description: "AI analysis text" })
  analysis?: string;

  @ApiPropertyOptional({
    description: "Human-readable message when status is no_recommendations",
  })
  pipelineMessage?: string;

  @ApiPropertyOptional({
    description:
      "One line per failed recommendation when graph apply rejected tools",
    type: [String],
  })
  rejectionDetails?: string[];

  @ApiProperty({
    description: "Pipeline status",
    enum: ["candidate_created", "no_recommendations", "error"],
  })
  status: "candidate_created" | "no_recommendations" | "error";

  @ApiPropertyOptional({ description: "Present when status is error" })
  error?: string;
}
