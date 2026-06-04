import { useQuery } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import { apiService } from "../services/api.service";

/**
 * Fetches WebP thumbnails for a list of document IDs in a single bulk request.
 *
 * Returns a map of document ID → base64 data URL (`"data:image/webp;base64,…"`)
 * for documents that have a thumbnail, or `null` for those that don't.
 * The query is skipped when the list is empty or no active group is set.
 *
 * @param documentIds - IDs of the documents to fetch thumbnails for.
 * @returns React Query result containing `Record<string, string | null>`.
 */
export function useDocumentThumbnails(
  documentIds: string[],
): ReturnType<typeof useQuery<Record<string, string | null>, Error>> {
  const { activeGroup } = useGroup();

  // Stable query key: sort IDs so reordering the list doesn't trigger a refetch.
  const sortedKey = [...documentIds].sort().join(",");

  return useQuery({
    queryKey: ["document-thumbnails", activeGroup?.id ?? null, sortedKey],
    queryFn: async (): Promise<Record<string, string | null>> => {
      if (!activeGroup?.id || documentIds.length === 0) return {};
      const params = new URLSearchParams();
      params.set("group_id", activeGroup.id);
      params.set("ids", documentIds.join(","));
      const response = await apiService.get<
        Array<{ documentId: string; thumbnailData: string | null }>
      >(`/documents/thumbnails?${params.toString()}`);
      if (response.success && response.data) {
        // Convert array to object for convenient lookup
        return Object.fromEntries(
          response.data.map((item) => [item.documentId, item.thumbnailData]),
        );
      }
      throw new Error(response.message ?? "Failed to fetch thumbnails");
    },
    enabled: documentIds.length > 0 && !!activeGroup?.id,
    staleTime: 1000 * 60 * 5,
  });
}
