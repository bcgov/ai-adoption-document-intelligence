import { useQuery } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

export interface EligibleDocument {
  id: string;
  originalFilename: string;
  fileType: string;
  approvedAt: string;
  reviewerId: string;
  fieldCount: number;
  correctionCount: number;
}

interface EligibleDocumentsResponse {
  documents: EligibleDocument[];
  total: number;
  page: number;
  limit: number;
}

export const useEligibleDocuments = (page = 1, limit = 20, search?: string) => {
  const { activeGroup } = useGroup();
  const activeGroupId = activeGroup?.id;

  const query = useQuery({
    queryKey: ["hitl-eligible-documents", page, limit, search, activeGroupId],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) {
        params.set("search", search);
      }
      if (activeGroupId) {
        params.set("group_id", activeGroupId);
      }

      const response = await apiService.get<EligibleDocumentsResponse>(
        `/benchmark/datasets/from-hitl/eligible-documents?${params.toString()}`,
      );
      return (
        response.data || {
          documents: [],
          total: 0,
          page: 1,
          limit: 20,
        }
      );
    },
  });

  return {
    documents: query.data?.documents || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    limit: query.data?.limit || 20,
    isLoading: query.isLoading,
    error: query.error,
  };
};
