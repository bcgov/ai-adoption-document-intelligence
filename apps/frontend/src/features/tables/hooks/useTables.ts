import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { TableSummary } from "../types";

export function useTables(groupId: string | null) {
  return useQuery({
    queryKey: ["tables", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<TableSummary[]> => {
      const response = await apiService.get<TableSummary[]>(
        `/tables?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "failed to load tables");
      return response.data;
    },
  });
}
