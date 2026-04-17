import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export interface ConfusionProfile {
  id: string;
  name: string;
  description: string | null;
  matrix: Record<string, Record<string, number>>;
  metadata: Record<string, unknown> | null;
  groupId: string;
  createdAt: string;
  updatedAt: string;
}

interface DeriveProfileDto {
  name: string;
  description?: string;
  sources?: {
    templateModelIds?: string[];
    benchmarkRunIds?: string[];
    fieldKeys?: string[];
    startDate?: string;
    endDate?: string;
  };
}

interface UpdateProfileDto {
  name?: string;
  description?: string;
  matrix?: Record<string, Record<string, number>>;
  metadata?: Record<string, unknown>;
}

export function useConfusionProfiles(groupId: string) {
  const query = useQuery({
    queryKey: ["confusion-profiles", groupId],
    queryFn: async () => {
      const response = await apiService.get<ConfusionProfile[]>(
        `/groups/${groupId}/confusion-profiles`,
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch confusion profiles");
    },
    enabled: !!groupId,
  });

  return {
    profiles: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useConfusionProfile(groupId: string, profileId: string) {
  const query = useQuery({
    queryKey: ["confusion-profiles", groupId, profileId],
    queryFn: async () => {
      const response = await apiService.get<ConfusionProfile>(
        `/groups/${groupId}/confusion-profiles/${profileId}`,
      );
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch confusion profile");
    },
    enabled: !!groupId && !!profileId,
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useDeriveProfile(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: DeriveProfileDto) => {
      const response = await apiService.post<ConfusionProfile>(
        `/groups/${groupId}/confusion-profiles/derive`,
        dto,
      );
      if (!response.success) {
        throw new Error(
          response.message || "Failed to derive confusion profile",
        );
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["confusion-profiles", groupId],
      });
    },
  });
}

export function useUpdateProfile(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      dto,
    }: {
      profileId: string;
      dto: UpdateProfileDto;
    }) => {
      const response = await apiService.patch<ConfusionProfile>(
        `/groups/${groupId}/confusion-profiles/${profileId}`,
        dto,
      );
      if (!response.success) {
        throw new Error(
          response.message || "Failed to update confusion profile",
        );
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["confusion-profiles", groupId],
      });
    },
  });
}

export function useDeleteProfile(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileId: string) => {
      const response = await apiService.delete<void>(
        `/groups/${groupId}/confusion-profiles/${profileId}`,
      );
      if (!response.success) {
        throw new Error(
          response.message || "Failed to delete confusion profile",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["confusion-profiles", groupId],
      });
    },
  });
}
