/**
 * Request body for deriving a confusion profile from HITL corrections
 * and/or benchmark run mismatches.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

export class DeriveSourcesDto {
  @ApiPropertyOptional({
    description: "Filter corrections by template model IDs",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateModelIds?: string[];

  @ApiPropertyOptional({
    description: "Include mismatch pairs from these benchmark run IDs",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benchmarkRunIds?: string[];

  @ApiPropertyOptional({
    description: "Filter corrections by field keys",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fieldKeys?: string[];

  @ApiPropertyOptional({ description: "Start date filter (ISO 8601)" })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date filter (ISO 8601)" })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class DeriveConfusionProfileDto {
  @ApiProperty({ description: "Profile name" })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Profile description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Data sources to derive the matrix from",
    type: DeriveSourcesDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeriveSourcesDto)
  sources?: DeriveSourcesDto;
}
