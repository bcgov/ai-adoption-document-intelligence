import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

/**
 * Mutation for patching a table's label and/or description.
 *
 * @param groupId - Active group identifier.
 * @param tableId - Stable table identifier.
 * @returns A TanStack `UseMutationResult` that patches `/tables/:tableId`.
 */
export function useUpdateTable(
  groupId: string | null,
  tableId: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      label?: string;
      description?: string | null;
    }) => {
      const response = await apiService.patch(
        `/tables/${tableId}?group_id=${groupId}`,
        patch,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to update table");
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables", groupId, tableId] });
      qc.invalidateQueries({ queryKey: ["tables", groupId] });
    },
  });
}
