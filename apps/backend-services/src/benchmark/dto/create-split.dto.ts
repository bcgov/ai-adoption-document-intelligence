/**
 * Create Split Request DTO
 *
 * Used to create a new split for a dataset version.
 * See US-033: Split Management UI
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export enum SplitType {
  train = "train",
  val = "val",
  test = "test",
  golden = "golden",
}

export class CreateSplitDto {
  @ApiProperty({
    description: "Name of the split (e.g., 'train-v1', 'golden-regression')",
    example: "train-v1",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9\-_.]+$/, {
    message: "Split name can only contain letters, numbers, hyphens, underscores, and dots",
  })
  name: string;

  @ApiProperty({
    description: "Type of split",
    enum: SplitType,
    example: SplitType.train,
  })
  @IsEnum(SplitType)
  type: SplitType;

  @ApiProperty({
    description: "Array of sample IDs to include in this split",
    example: ["sample-1", "sample-2", "sample-3"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  sampleIds: string[];

  @ApiPropertyOptional({
    description: "Optional stratification rules for distributing samples",
    example: { field: "docType", values: ["invoice", "receipt", "contract"] },
  })
  @IsOptional()
  stratificationRules?: Record<string, unknown>;
}
