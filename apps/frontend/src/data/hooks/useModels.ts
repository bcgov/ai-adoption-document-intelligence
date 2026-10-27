import { useQuery } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
import { apiService } from "../services/api.service";

interface ModelsResponse {
  models: string[];
}

/**
 * Lists the prebuilt models and the active group's trained models. Nothing is
 * requested until a group is active.
 */
export function useModels() {
  const { activeGroup } = useGroup();
  const groupId = activeGroup?.id;

  return useQuery({
    queryKey: ["models", groupId],
    queryFn: async (): Promise<string[]> => {
      const response = await apiService.get<ModelsResponse>(
        `/models?group_id=${encodeURIComponent(groupId ?? "")}`,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to fetch models");
      }
      return response.data.models;
    },
    enabled: Boolean(groupId),
    staleTime: 0, // Always refetch when the page mounts
  });
}
