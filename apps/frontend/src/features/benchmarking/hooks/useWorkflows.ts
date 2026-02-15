import { useQuery } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface WorkflowInfo {
  id: string;
  name: string;
  version: number;
  description: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const useWorkflows = () => {
  const workflowsQuery = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const response = await apiService.get<{ workflows: WorkflowInfo[] }>(
        "/workflows",
      );
      return response.data?.workflows || [];
    },
  });

  return {
    workflows: workflowsQuery.data || [],
    isLoading: workflowsQuery.isLoading,
    error: workflowsQuery.error,
  };
};
