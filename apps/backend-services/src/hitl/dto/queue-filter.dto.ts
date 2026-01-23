import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export enum DocumentStatusFilter {
  COMPLETED_OCR = "completed_ocr",
  ALL = "all",
}

export class QueueFilterDto {
  @ApiPropertyOptional({
    description: "Filter by document status",
    enum: DocumentStatusFilter,
    default: DocumentStatusFilter.COMPLETED_OCR,
  })
  @IsOptional()
  @IsEnum(DocumentStatusFilter)
  status?: DocumentStatusFilter;

  @ApiPropertyOptional({ description: "Filter by model ID" })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({
    description: "Maximum confidence threshold (show fields below this)",
    default: 0.9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxConfidence?: number;

  @ApiPropertyOptional({ description: "Limit results", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: "Offset for pagination", default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}

export class AnalyticsFilterDto {
  @ApiPropertyOptional({ description: "Start date for analytics period" })
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ description: "End date for analytics period" })
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ description: "Filter by reviewer ID" })
  @IsOptional()
  @IsString()
  reviewerId?: string;
}
