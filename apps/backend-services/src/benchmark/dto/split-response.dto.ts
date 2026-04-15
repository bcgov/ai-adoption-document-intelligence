/**
 * Split Response DTOs
 *
 * Response shapes for split CRUD operations on dataset versions.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SplitType } from "./create-split.dto";

/**
 * Response DTO for a split returned after creation or update.
 */
export class SplitResponseDto {
  @ApiProperty({ description: "Split ID (UUID)" })
  id!: string;

  @ApiProperty({ description: "Parent dataset version ID (UUID)" })
  datasetVersionId!: string;

  @ApiProperty({ description: "Split name", example: "train-v1" })
  name!: string;

  @ApiProperty({
    description: "Split type",
    enum: SplitType,
    example: SplitType.train,
  })
  type!: string;

  @ApiProperty({
    description: "Array of sample IDs included in this split",
    type: [String],
  })
  sampleIds!: string[];

  @ApiPropertyOptional({
    description: "Optional stratification rules",
    example: { field: "docType", values: ["invoice", "receipt"] },
  })
  stratificationRules?: Record<string, unknown>;

  @ApiProperty({ description: "Whether the split is frozen (immutable)" })
  frozen!: boolean;

  @ApiProperty({ description: "Timestamp when the split was created" })
  createdAt!: Date;
}

/**
 * Response DTO for a split with full detail (includes sampleCount).
 */
export class SplitDetailResponseDto extends SplitResponseDto {
  @ApiProperty({ description: "Number of samples in the split" })
  sampleCount!: number;
}

/**
 * Response DTO for a single item in the split list (no sampleIds, includes sampleCount).
 */
export class SplitListDetailDto {
  @ApiProperty({ description: "Split ID (UUID)" })
  id!: string;

  @ApiProperty({ description: "Parent dataset version ID (UUID)" })
  datasetVersionId!: string;

  @ApiProperty({ description: "Split name", example: "train-v1" })
  name!: string;

  @ApiProperty({
    description: "Split type",
    enum: SplitType,
    example: SplitType.train,
  })
  type!: string;

  @ApiProperty({ description: "Number of samples in the split" })
  sampleCount!: number;

  @ApiProperty({ description: "Whether the split is frozen (immutable)" })
  frozen!: boolean;

  @ApiPropertyOptional({
    description: "Optional stratification rules",
    example: { field: "docType", values: ["invoice", "receipt"] },
  })
  stratificationRules?: Record<string, unknown>;

  @ApiProperty({ description: "Timestamp when the split was created" })
  createdAt!: Date;
}

/**
 * Response DTO for the list-splits endpoint (wraps array in a splits key).
 */
export class SplitListResponseDto {
  @ApiProperty({
    description: "List of splits for the dataset version",
    type: [SplitListDetailDto],
  })
  splits!: SplitListDetailDto[];
}

/**
 * Response DTO for the freeze-split endpoint (minimal fields).
 */
export class FreezeSplitResponseDto {
  @ApiProperty({ description: "Split ID (UUID)" })
  id!: string;

  @ApiProperty({ description: "Parent dataset version ID (UUID)" })
  datasetVersionId!: string;

  @ApiProperty({ description: "Split name" })
  name!: string;

  @ApiProperty({ description: "Split type", enum: SplitType })
  type!: string;

  @ApiProperty({ description: "Whether the split is frozen (immutable)" })
  frozen!: boolean;
}
