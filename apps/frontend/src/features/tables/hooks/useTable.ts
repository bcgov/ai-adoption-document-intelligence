import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { TableDetail } from "../types";

export function useTable(groupId: string | null, tableId: string | null) {
  return useQuery({
    queryKey: ["tables", groupId, tableId],
    enabled: !!groupId && !!tableId,
    queryFn: async (): Promise<TableDetail> => {
      const response = await apiService.get<TableDetail>(
        `/tables/${tableId}?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "failed to load table");
      return response.data;
    },
  });
}
