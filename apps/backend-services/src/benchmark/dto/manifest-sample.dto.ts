/**
 * Manifest Sample DTOs
 *
 * Data transfer objects for dataset manifest and sample preview.
 * See feature-docs/003-benchmarking-system/user-stories/US-009-dataset-manifest-sample-preview.md
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Input file reference within a sample
 */
export class InputFileDto {
  @ApiProperty({
    description: "Relative path to the input file within the dataset repository",
    example: "inputs/form_image_0.jpg",
  })
  path: string;

  @ApiProperty({
    description: "MIME type of the input file",
    example: "image/jpeg",
  })
  mimeType: string;
}

/**
 * Ground truth file reference within a sample
 */
export class GroundTruthFileDto {
  @ApiProperty({
    description:
      "Relative path to the ground truth file within the dataset repository",
    example: "ground-truth/form_data_0.json",
  })
  path: string;

  @ApiProperty({
    description: "Format of the ground truth file (json, jsonl, csv, etc.)",
    example: "json",
  })
  format: string;
}

/**
 * Manifest sample
 */
export class ManifestSampleDto {
  @ApiProperty({
    description: "Unique sample identifier",
    example: "sample-001",
  })
  id: string;

  @ApiProperty({
    description: "Array of input file references",
    type: [InputFileDto],
  })
  inputs: InputFileDto[];

  @ApiProperty({
    description: "Array of ground truth file references",
    type: [GroundTruthFileDto],
  })
  groundTruth: GroundTruthFileDto[];

  @ApiProperty({
    description: "Sample metadata (docType, pageCount, language, source, etc.)",
    example: {
      docType: "income-declaration",
      pageCount: 1,
      language: "en",
      source: "synthetic",
    },
    required: false,
  })
  metadata?: Record<string, unknown>;
}

/**
 * Paginated sample list response
 */
export class SampleListResponseDto {
  @ApiProperty({
    description: "Array of samples",
    type: [ManifestSampleDto],
  })
  samples: ManifestSampleDto[];

  @ApiProperty({
    description: "Total number of samples in the dataset version",
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: "Current page number",
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: "Number of items per page",
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: "Total number of pages",
    example: 5,
  })
  totalPages: number;
}
