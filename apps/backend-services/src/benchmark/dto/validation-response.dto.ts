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
  valid: boolean;
  sampled: boolean;
  sampleSize?: number;
  totalSamples: number;
  issueCount: {
    schemaViolations: number;
    missingGroundTruth: number;
    duplicates: number;
    corruption: number;
  };
  issues: ValidationIssue[];
}
