import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  DocumentStatusFilter,
  ReviewStatusFilter,
} from "./status-constants.dto";

export class QueueFilterDto {
  @ApiPropertyOptional({
    description: "Filter by document status",
    enum: DocumentStatusFilter,
    default: DocumentStatusFilter.EXTRACTED,
  })
  @IsOptional()
  @IsEnum(DocumentStatusFilter)
  status?: DocumentStatusFilter;

  @ApiPropertyOptional({ description: "Filter by model ID" })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({ description: "Filter by workflow ID" })
  @IsOptional()
  @IsString()
  workflowId?: string;

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

  @ApiPropertyOptional({
    description: "Filter by review status",
    enum: ReviewStatusFilter,
    enumName: "ReviewStatusFilter",
    default: ReviewStatusFilter.PENDING,
  })
  @IsOptional()
  @IsEnum(ReviewStatusFilter)
  reviewStatus?: ReviewStatusFilter;

  @ApiPropertyOptional({
    description: "Scope results to a specific group ID",
  })
  @IsOptional()
  @IsString()
  group_id?: string;

  @ApiPropertyOptional({
    description: "Filter by filename (case-insensitive, partial match)",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Field to sort by",
    enum: ["filename", "created_at", "model", "workflow"],
    default: "created_at",
  })
  @IsOptional()
  @IsEnum(["filename", "created_at", "model", "workflow"])
  sortBy?: "filename" | "created_at" | "model" | "workflow";

  @ApiPropertyOptional({
    description: "Sort direction",
    enum: ["asc", "desc"],
    default: "desc",
  })
  @IsOptional()
  @IsEnum(["asc", "desc"])
  sortDir?: "asc" | "desc";
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

  @ApiPropertyOptional({
    description: "Scope results to a specific group ID",
  })
  @IsOptional()
  @IsString()
  group_id?: string;
}
