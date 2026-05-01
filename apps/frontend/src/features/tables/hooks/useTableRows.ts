import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";
import type { TableRow } from "../types";

export function useTableRows(
  groupId: string | null,
  tableId: string | null,
  opts: { offset: number; limit: number },
) {
  return useQuery({
    queryKey: ["table-rows", groupId, tableId, opts.offset, opts.limit],
    enabled: !!groupId && !!tableId,
    queryFn: async (): Promise<{ rows: TableRow[]; total: number }> => {
      const response = await apiService.get<{
        rows: TableRow[];
        total: number;
      }>(
        `/tables/${tableId}/rows?group_id=${groupId}&offset=${opts.offset}&limit=${opts.limit}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "failed to load rows");
      return response.data;
    },
  });
}
