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
import { ReviewStatusFilter } from "./status-constants.dto";

export class NextSessionFilterDto {
  @ApiPropertyOptional({ description: "Filter by model ID" })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({
    description: "Maximum confidence threshold",
    default: 0.9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxConfidence?: number;

  @ApiPropertyOptional({
    description: "Filter by review status",
    enum: ReviewStatusFilter,
  })
  @IsOptional()
  @IsEnum(ReviewStatusFilter)
  reviewStatus?: ReviewStatusFilter;

  @ApiPropertyOptional({ description: "Scope to a specific group ID" })
  @IsOptional()
  @IsString()
  group_id?: string;
}
