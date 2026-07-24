import { useQuery } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import type { Document, DocumentStatus } from "../../shared/types";
import { apiService } from "../services/api.service";

export interface PaginatedDocuments {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

interface UseDocumentsOptions {
  refetchInterval?:
    | number
    | false
    | ((query: { state: { data?: PaginatedDocuments } }) => number | false);
  staleTime?: number;
  limit?: number;
  offset?: number;
  search?: string;
  status?: DocumentStatus | "all";
  sortBy?: string;
  sortDir?: "asc" | "desc";
  source?: string;
}

/**
 * Fetches a paginated list of documents, scoped to the active group when one
 * is set.  The response envelope `{ documents, total, limit, offset }` lets
 * callers implement pagination UI and adaptive refetch intervals.
 *
 * When `activeGroup` is present the request includes a `group_id` query
 * parameter so only that group's documents are returned.  The `activeGroup.id`
 * is part of the React Query key so switching groups triggers a new fetch.
 *
 * Supports server-side search, status filtering, and sorting.
 *
 * @param options - Optional pagination, filtering, and polling configuration.
 * @returns The React Query result containing `PaginatedDocuments`.
 */
export function useDocuments(
  options?: UseDocumentsOptions,
): ReturnType<typeof useQuery<PaginatedDocuments, Error>> {
  const { activeGroup } = useGroup();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const search = options?.search;
  const status = options?.status ?? "all";
  const sortBy = options?.sortBy ?? "created_at";
  const sortDir = options?.sortDir ?? "desc";
  const source = options?.source ?? "api";

  return useQuery({
    queryKey: [
      "documents",
      activeGroup?.id ?? null,
      limit,
      offset,
      search,
      status,
      sortBy,
      sortDir,
      source,
    ],
    queryFn: async (): Promise<PaginatedDocuments> => {
      const params = new URLSearchParams();
      if (activeGroup?.id) params.set("group_id", activeGroup.id);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (source) params.set("source", source);
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      const qs = params.toString();
      const endpoint = `/documents${qs ? `?${qs}` : ""}`;
      const response = await apiService.get<PaginatedDocuments>(endpoint);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch documents");
    },
    staleTime: options?.staleTime ?? 1000 * 60 * 5,
    refetchInterval: options?.refetchInterval,
  });
}
