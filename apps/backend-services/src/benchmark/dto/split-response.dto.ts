/**
 * Split Response DTOs
 *
 * Response structures for split endpoints.
 * See US-033: Split Management UI
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SplitResponseDto {
  @ApiProperty({ description: "Split ID (UUID)", example: "uuid-123" })
  id: string;

  @ApiProperty({ description: "Dataset version ID", example: "uuid-456" })
  datasetVersionId: string;

  @ApiProperty({ description: "Split name", example: "train-v1" })
  name: string;

  @ApiProperty({
    description: "Split type",
    enum: ["train", "val", "test", "golden"],
    example: "train",
  })
  type: string;

  @ApiProperty({
    description: "Number of samples in this split",
    example: 150,
  })
  sampleCount: number;

  @ApiProperty({
    description: "Whether this split is frozen (immutable)",
    example: false,
  })
  frozen: boolean;

  @ApiPropertyOptional({
    description: "Stratification rules if applied",
    example: { field: "docType" },
  })
  stratificationRules?: Record<string, unknown>;

  @ApiProperty({
    description: "Creation timestamp",
    example: "2026-02-15T12:00:00.000Z",
  })
  createdAt: Date;
}

export class SplitListResponseDto {
  @ApiProperty({
    description: "List of splits for this dataset version",
    type: [SplitResponseDto],
  })
  splits: SplitResponseDto[];
}

export class SplitDetailResponseDto extends SplitResponseDto {
  @ApiProperty({
    description: "Array of sample IDs in this split",
    type: [String],
    example: ["sample-1", "sample-2", "sample-3"],
  })
  sampleIds: string[];
}
