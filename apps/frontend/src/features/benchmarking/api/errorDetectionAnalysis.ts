import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export interface ErrorDetectionCurvePoint {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface ErrorDetectionField {
  name: string;
  evaluatedCount: number;
  errorCount: number;
  errorRate: number;
  curve: ErrorDetectionCurvePoint[];
  suggestedCatch90: number | null;
  suggestedBestBalance: number;
  suggestedMinimizeReview: number | null;
}

export interface ErrorDetectionAnalysis {
  runId: string;
  notReady: boolean;
  fields: ErrorDetectionField[];
  excludedFields: string[];
}

export async function fetchErrorDetectionAnalysis(
  projectId: string,
  runId: string,
): Promise<ErrorDetectionAnalysis> {
  const response = await apiService.get<ErrorDetectionAnalysis>(
    `/benchmark/projects/${projectId}/runs/${runId}/error-detection-analysis`,
  );
  return response.data as ErrorDetectionAnalysis;
}

export const useErrorDetectionAnalysis = (projectId: string, runId: string) => {
  const query = useQuery({
    queryKey: ["benchmark-error-detection-analysis", projectId, runId],
    queryFn: () => fetchErrorDetectionAnalysis(projectId, runId),
    enabled: !!projectId && !!runId,
  });

  return {
    analysis: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
};
