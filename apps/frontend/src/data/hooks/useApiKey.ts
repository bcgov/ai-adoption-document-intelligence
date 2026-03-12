import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "../../auth/GroupContext";
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
  const { activeGroup } = useGroup();

  return useQuery({
    queryKey: ["apiKey", activeGroup?.id],
    queryFn: async (): Promise<ApiKeyInfo | null> => {
      if (!activeGroup) {
        throw new Error("No active group selected");
      }
      const response = await apiService.get<ApiKeyResponse>(
        `/api-key?groupId=${activeGroup.id}`,
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch API key");
      }
      return response.data?.apiKey || null;
    },
    enabled: activeGroup !== null,
  });
}

export function useGenerateApiKey() {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  return useMutation({
    mutationFn: async (): Promise<GeneratedApiKey> => {
      if (!activeGroup) {
        throw new Error("No active group selected");
      }
      const response = await apiService.post<GeneratedApiKeyResponse>(
        "/api-key",
        { groupId: activeGroup.id },
      );
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
    mutationFn: async (keyId: string): Promise<void> => {
      const response = await apiService.delete(`/api-key?id=${keyId}`);
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
    mutationFn: async (keyId: string): Promise<GeneratedApiKey> => {
      const response = await apiService.post<GeneratedApiKeyResponse>(
        "/api-key/regenerate",
        { id: keyId },
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
