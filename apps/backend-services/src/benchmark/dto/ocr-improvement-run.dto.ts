/**
 * DTOs for OCR improvement pipeline generate endpoint.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class OcrImprovementGenerateDto {
  @ApiProperty({
    description:
      'Force emptyValueCoercion on every ocr.normalizeFields node ("none" | "blank" | "null")',
    required: false,
    enum: ["none", "blank", "null"],
  })
  @IsOptional()
  @IsIn(["none", "blank", "null"])
  normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
}

export class OcrImprovementGenerateResponseDto {
  @ApiProperty({ description: "Candidate workflow version ID" })
  candidateWorkflowVersionId: string;

  @ApiProperty({ description: "Candidate workflow lineage ID" })
  candidateLineageId: string;

  @ApiProperty({ description: "Summary of applied/rejected recommendations" })
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };

  @ApiProperty({ description: "AI analysis text", required: false })
  analysis?: string;

  @ApiProperty({
    description: "Human-readable message when status is no_recommendations",
    required: false,
  })
  pipelineMessage?: string;

  @ApiProperty({
    description: "Per-recommendation rejection reasons",
    required: false,
  })
  rejectionDetails?: string[];

  @ApiProperty({
    description: "Pipeline status",
    enum: ["candidate_created", "no_recommendations", "error"],
  })
  status: "candidate_created" | "no_recommendations" | "error";

  @ApiProperty({
    description: "Error message if status is error",
    required: false,
  })
  error?: string;
}
