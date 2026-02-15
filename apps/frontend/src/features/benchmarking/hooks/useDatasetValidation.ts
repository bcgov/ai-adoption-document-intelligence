import { useMutation } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

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

export interface ValidationResponse {
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

export function useValidateDataset(datasetId: string, versionId: string) {
  return useMutation({
    mutationFn: async (sampleSize?: number) => {
      const response = await apiService.post<ValidationResponse>(
        `/api/benchmark/datasets/${datasetId}/versions/${versionId}/validate`,
        sampleSize ? { sampleSize } : {},
      );
      return response;
    },
  });
}
