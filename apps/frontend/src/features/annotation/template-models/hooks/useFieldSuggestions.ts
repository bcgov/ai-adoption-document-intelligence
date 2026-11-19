import { useMutation } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { FieldType } from "../../core/types/field";

/** One field the LLM suggested from a document. */
export interface SuggestedField {
  field_key: string;
  field_type: FieldType;
  description: string;
  value: string | null;
  page_number: number | null;
  already_exists: boolean;
}

export const useFieldSuggestions = (templateModelId?: string) => {
  const suggestFieldsMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.post<SuggestedField[]>(
        `/template-models/${templateModelId}/field-suggestions`,
        { document_id: documentId },
      );
      if (!response.success) {
        throw new Error(response.message ?? "Suggesting fields failed");
      }
      return response.data ?? [];
    },
  });

  return {
    suggestFieldsAsync: suggestFieldsMutation.mutateAsync,
    isSuggestingFields: suggestFieldsMutation.isPending,
  };
};
