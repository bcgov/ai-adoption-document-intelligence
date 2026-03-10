import { useMutation } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export interface LabelSuggestionDto {
  field_key: string;
  label_name: string;
  value?: string;
  page_number: number;
  element_ids: string[];
  bounding_box: {
    polygon: number[];
    span?: {
      offset?: number;
      length?: number;
    };
    [key: string]: unknown;
  };
  source_type: "keyValuePair" | "selectionMarkOrder" | "tableCellToWords";
  confidence?: number;
  explanation?: string;
}

export const useSuggestions = (projectId?: string, documentId?: string) => {
  const loadSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post<LabelSuggestionDto[]>(
        `/labeling/projects/${projectId}/documents/${documentId}/suggestions`,
        {},
      );
      return response.data || [];
    },
  });

  return {
    loadSuggestions: loadSuggestionsMutation.mutate,
    loadSuggestionsAsync: loadSuggestionsMutation.mutateAsync,
    isLoadingSuggestions: loadSuggestionsMutation.isPending,
    suggestionError: loadSuggestionsMutation.error,
  };
};
