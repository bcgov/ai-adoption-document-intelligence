import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export type SuggestionSourceType =
  | "keyValuePair"
  | "selectionMarkOrder"
  | "tableCellToWords";

export interface SuggestionRule {
  fieldKey: string;
  sourceType: SuggestionSourceType;
  keyAliases?: string[];
  selectionOrder?: number;
  normalizers?: string[];
  confidenceThreshold?: number;
  table?: {
    anchorText?: string;
    rowLabelAliases?: string[];
    columnLabel?: string;
    wordOverlapThreshold?: number;
  };
}

export interface SuggestionMapping {
  version?: number;
  rules: SuggestionRule[];
}

interface SuggestionMappingResponse {
  project_id: string;
  suggestion_mapping: SuggestionMapping | null;
}

export const useSuggestionMapping = (projectId?: string) => {
  const queryClient = useQueryClient();

  const mappingQuery = useQuery({
    queryKey: ["labeling-suggestion-mapping", projectId],
    queryFn: async () => {
      const response = await apiService.get<SuggestionMappingResponse>(
        `/labeling/projects/${projectId}/suggestion-mapping`,
      );
      return response.data?.suggestion_mapping ?? null;
    },
    enabled: Boolean(projectId),
  });

  const updateMappingMutation = useMutation({
    mutationFn: async (suggestionMapping: SuggestionMapping | null) => {
      const response = await apiService.put<SuggestionMappingResponse>(
        `/labeling/projects/${projectId}/suggestion-mapping`,
        { suggestion_mapping: suggestionMapping },
      );
      return response.data?.suggestion_mapping ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["labeling-suggestion-mapping", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["labeling-project", projectId],
      });
    },
  });

  return {
    suggestionMapping: mappingQuery.data ?? null,
    isLoading: mappingQuery.isLoading,
    error: mappingQuery.error,
    updateSuggestionMapping: updateMappingMutation.mutate,
    updateSuggestionMappingAsync: updateMappingMutation.mutateAsync,
    isUpdating: updateMappingMutation.isPending,
  };
};
