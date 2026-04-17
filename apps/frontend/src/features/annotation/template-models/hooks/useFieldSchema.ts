import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import { type FieldDefinition, FieldType } from "../../core/types/field";

interface CreateFieldDefinitionDto {
  field_key: string;
  field_type: string;
  field_format?: string;
  format_spec?: string;
  display_order?: number;
}

interface UpdateFieldDefinitionDto {
  field_format?: string;
  format_spec?: string;
  display_order?: number;
}

interface ApiFieldDefinition {
  id: string;
  fieldKey?: string;
  field_key?: string;
  fieldType?: string;
  field_type?: string;
  fieldFormat?: string;
  field_format?: string;
  formatSpec?: string;
  format_spec?: string;
  displayOrder?: number;
  display_order?: number;
}

export const useFieldSchema = (templateModelId?: string) => {
  const queryClient = useQueryClient();

  const normalizeSchema = (fields: ApiFieldDefinition[]): FieldDefinition[] =>
    (fields || []).map((field) => ({
      id: field.id,
      fieldKey: field.fieldKey ?? field.field_key ?? "",
      fieldType: (field.fieldType ??
        field.field_type ??
        FieldType.STRING) as FieldType,
      fieldFormat: field.fieldFormat ?? field.field_format,
      formatSpec: field.formatSpec ?? field.format_spec,
      displayOrder: field.displayOrder ?? field.display_order ?? 0,
    }));

  const schemaQuery = useQuery({
    queryKey: ["template-model-field-schema", templateModelId],
    queryFn: async () => {
      const response = await apiService.get<ApiFieldDefinition[]>(
        `/template-models/${templateModelId}/fields`,
      );
      return normalizeSchema(response.data || []);
    },
    enabled: Boolean(templateModelId),
  });

  const addFieldMutation = useMutation({
    mutationFn: async (data: CreateFieldDefinitionDto) => {
      const response = await apiService.post<ApiFieldDefinition>(
        `/template-models/${templateModelId}/fields`,
        data,
      );
      return response.data ? normalizeSchema([response.data])[0] : null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["template-model-field-schema", templateModelId],
      });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({
      fieldId,
      data,
    }: {
      fieldId: string;
      data: UpdateFieldDefinitionDto;
    }) => {
      const response = await apiService.put<ApiFieldDefinition>(
        `/template-models/${templateModelId}/fields/${fieldId}`,
        data,
      );
      return response.data ? normalizeSchema([response.data])[0] : null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["template-model-field-schema", templateModelId],
      });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const response = await apiService.delete(
        `/template-models/${templateModelId}/fields/${fieldId}`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["template-model-field-schema", templateModelId],
      });
    },
  });

  return {
    schema: schemaQuery.data || [],
    isLoading: schemaQuery.isLoading,
    error: schemaQuery.error,
    addField: addFieldMutation.mutate,
    updateField: updateFieldMutation.mutate,
    deleteField: deleteFieldMutation.mutate,
    isAdding: addFieldMutation.isPending,
    isUpdating: updateFieldMutation.isPending,
    isDeleting: deleteFieldMutation.isPending,
  };
};
