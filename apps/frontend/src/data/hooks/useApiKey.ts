import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  userEmail: string;
  createdAt: string;
  lastUsed: string | null;
}

export interface GeneratedApiKey extends ApiKeyInfo {
  key: string;
}

interface ApiKeyResponse {
  apiKey: ApiKeyInfo | null;
}

interface GeneratedApiKeyResponse {
  apiKey: GeneratedApiKey;
}

export function useApiKey() {
  return useQuery({
    queryKey: ["apiKey"],
    queryFn: async (): Promise<ApiKeyInfo | null> => {
      const response = await apiService.get<ApiKeyResponse>("/api-key");
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch API key");
      }
      return response.data?.apiKey || null;
    },
  });
}

export function useGenerateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<GeneratedApiKey> => {
      const response =
        await apiService.post<GeneratedApiKeyResponse>("/api-key", {});
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to generate API key");
      }
      return response.data.apiKey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKey"] });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await apiService.delete("/api-key");
      if (!response.success) {
        throw new Error(response.message || "Failed to delete API key");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKey"] });
    },
  });
}

export function useRegenerateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<GeneratedApiKey> => {
      const response = await apiService.post<GeneratedApiKeyResponse>(
        "/api-key/regenerate",
        {},
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to regenerate API key");
      }
      return response.data.apiKey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKey"] });
    },
  });
}
