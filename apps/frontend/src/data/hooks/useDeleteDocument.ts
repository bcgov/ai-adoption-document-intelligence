import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import { apiService } from "../services/api.service";

/**
 * Mutation hook for deleting a document.
 *
 * Calls `DELETE /documents/:id`. On success, invalidates the documents query
 * (so the Processing Queue refreshes) and the HITL review queue (in case the
 * deleted document was sitting in someone's review queue too).
 *
 * The backend refuses to delete documents whose OCR pipeline is still in
 * flight (HTTP 409). The error's `message` will be propagated for the UI to
 * surface.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  return useMutation<void, Error, string>({
    mutationFn: async (documentId: string): Promise<void> => {
      const response = await apiService.delete<void>(
        `/documents/${documentId}`,
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to delete document");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["documents", activeGroup?.id ?? null],
      });
      queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
      queryClient.invalidateQueries({ queryKey: ["hitl-queue-stats"] });
    },
  });
}
