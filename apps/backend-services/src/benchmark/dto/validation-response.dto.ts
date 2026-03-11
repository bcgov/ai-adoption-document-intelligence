import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export interface ValidationIssue {
  category:
    | "schema_violation"
    | "missing_ground_truth"
    | "duplicate"
    | "corruption";
  severity: "error" | "warning";
  sampleId: string;
  filePath?: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ValidationResponseDto {
  @ApiProperty({ description: 'Whether the dataset is valid' })
  valid: boolean;

  @ApiProperty({ description: 'Whether a sample was used for validation' })
  sampled: boolean;

  @ApiPropertyOptional({ description: 'Number of samples validated' })
  sampleSize?: number;

  @ApiProperty({ description: 'Total number of samples in the dataset' })
  totalSamples: number;

  @ApiProperty({
    description: 'Count of issues by category',
    type: 'object',
    properties: {
      schemaViolations: { type: 'number' },
      missingGroundTruth: { type: 'number' },
      duplicates: { type: 'number' },
      corruption: { type: 'number' },
    },
  })
  issueCount: {
    schemaViolations: number;
    missingGroundTruth: number;
    duplicates: number;
    corruption: number;
  };

  @ApiProperty({ description: 'List of validation issues', type: 'array' })
  issues: ValidationIssue[];
}
