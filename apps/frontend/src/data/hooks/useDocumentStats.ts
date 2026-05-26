import { useQuery } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import { apiService } from "../services/api.service";

export interface DocumentStatusCounts {
  total: number;
  pre_ocr: number;
  ongoing_ocr: number;
  completed_ocr: number;
  awaiting_review: number;
  ready: number;
  failed: number;
  rejected_by_human: number;
  conversion_failed: number;
}

/**
 * Fetches global document counts grouped by status for the active group.
 *
 * Returns server-wide counts (not scoped to the current page) so that the
 * processing queue stat cards remain accurate regardless of which page is
 * currently displayed.
 */
export function useDocumentStats(): ReturnType<
  typeof useQuery<DocumentStatusCounts, Error>
> {
  const { activeGroup } = useGroup();

  return useQuery({
    queryKey: ["document-stats", activeGroup?.id ?? null],
    queryFn: async (): Promise<DocumentStatusCounts> => {
      const params = new URLSearchParams();
      if (activeGroup?.id) params.set("group_id", activeGroup.id);
      const qs = params.toString();
      const endpoint = `/documents/stats${qs ? `?${qs}` : ""}`;
      const response = await apiService.get<DocumentStatusCounts>(endpoint);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch document stats");
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
