/**
 * Ground Truth Response DTO
 *
 * Data transfer object for fetching ground truth JSON content from a sample.
 * See feature-docs/003-benchmarking-system/user-stories/US-028-dataset-version-sample-preview-ui.md (Scenario 5)
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Ground truth content response
 */
export class GroundTruthResponseDto {
  @ApiProperty({
    description: "Sample ID",
    example: "sample-001",
  })
  sampleId!: string;

  @ApiProperty({
    description: "Ground truth JSON content",
    example: {
      invoice_number: "INV-2024-001",
      total_amount: 1250.75,
      date: "2024-01-15",
      vendor: "Acme Corp",
    },
  })
  content!: Record<string, unknown>;

  @ApiProperty({
    description: "Path to the ground truth file in the repository",
    example: "ground-truth/data_001.json",
  })
  path!: string;

  @ApiProperty({
    description: "Format of the ground truth file",
    example: "json",
  })
  format!: string;
}
