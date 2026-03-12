import { useMutation } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { ApiResponse } from "@/shared/types";

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

export function useValidateDataset(datasetId: string) {
  return useMutation<
    ApiResponse<ValidationResponse>,
    Error,
    { versionId: string; sampleSize?: number }
  >({
    mutationFn: async ({ versionId, sampleSize }) => {
      const response = await apiService.post<ValidationResponse>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/validate`,
        sampleSize ? { sampleSize } : {},
      );
      return response;
    },
  });
}
