import { useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

interface ModelsResponse {
  models: string[];
}

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async (): Promise<string[]> => {
      const response = await apiService.get<ModelsResponse>("/models");
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to fetch models");
      }
      return response.data.models;
    },
    staleTime: 1000 * 60 * 60, // 1 hour - models rarely change
  });
}
