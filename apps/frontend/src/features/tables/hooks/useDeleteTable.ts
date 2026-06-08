import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiService } from "@/data/services/api.service";

/**
 * Mutation for permanently deleting a table.
 * On success, invalidates the tables list cache and navigates back to `/tables`.
 *
 * @param groupId - Active group identifier.
 * @param tableId - Stable table identifier.
 * @returns A TanStack `UseMutationResult` that calls `DELETE /tables/:tableId`.
 */
export function useDeleteTable(
  groupId: string | null,
  tableId: string | undefined,
) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      const response = await apiService.delete(
        `/tables/${tableId}?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to delete table");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables", groupId] });
      navigate("/tables");
    },
  });
}
