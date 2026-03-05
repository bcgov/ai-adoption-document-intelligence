import { useQuery } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import type { Document } from "../../shared/types";
import { apiService } from "../services/api.service";

interface UseDocumentsOptions {
  refetchInterval?: number;
  staleTime?: number;
}

/**
 * Fetches the list of documents, scoped to the active group when one is set.
 *
 * When `activeGroup` is present the request includes a `group_id` query
 * parameter so only that group's documents are returned. When no active group
 * is set the request omits the parameter and the backend falls back to
 * returning all documents across every group the identity belongs to.
 *
 * The `activeGroup.id` is included in the React Query `queryKey` so the
 * query automatically re-fetches whenever the active group changes.
 *
 * @param options - Optional configuration for stale time and refetch interval.
 * @returns The React Query result containing the documents array.
 */
export function useDocuments(
  options?: UseDocumentsOptions,
): ReturnType<typeof useQuery<Document[], Error>> {
  const { activeGroup } = useGroup();

  return useQuery({
    queryKey: ["documents", activeGroup?.id ?? null],
    queryFn: async (): Promise<Document[]> => {
      const endpoint = activeGroup?.id
        ? `/documents?group_id=${activeGroup.id}`
        : "/documents";
      const response = await apiService.get<Document[]>(endpoint);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch documents");
    },
    staleTime: options?.staleTime ?? 1000 * 60 * 5,
    refetchInterval: options?.refetchInterval,
  });
}
