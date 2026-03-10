import { useQuery } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
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
  const { activeGroup } = useGroup();

  const workflowsQuery = useQuery({
    queryKey: ["workflows", activeGroup?.id],
    queryFn: async () => {
      const response = await apiService.get<{ workflows: WorkflowInfo[] }>(
        `/workflows?groupId=${activeGroup!.id}`,
      );
      return response.data?.workflows || [];
    },
    enabled: !!activeGroup?.id,
  });

  return {
    workflows: workflowsQuery.data || [],
    isLoading: workflowsQuery.isLoading,
    error: workflowsQuery.error,
  };
};
