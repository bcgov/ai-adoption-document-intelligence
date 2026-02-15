import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

/**
 * Schedule configuration types
 */
export interface ScheduleConfig {
  enabled: boolean;
  cron?: string;
}

export interface ScheduleInfo {
  scheduleId: string;
  cron: string;
  nextRunTime?: string;
  lastRunTime?: string;
  paused: boolean;
}

/**
 * Hook to configure a benchmark definition schedule
 */
export function useConfigureSchedule(projectId: string, definitionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: ScheduleConfig) => {
      const response = await apiService.post<{
        id: string;
        scheduleEnabled: boolean;
        scheduleCron?: string;
        scheduleId?: string;
      }>(
        `/api/benchmark/projects/${projectId}/definitions/${definitionId}/schedule`,
        config,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["definitions", projectId, definitionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["schedule-info", projectId, definitionId],
      });
    },
  });
}

/**
 * Hook to get schedule information
 */
export function useScheduleInfo(projectId: string, definitionId: string) {
  return useQuery({
    queryKey: ["schedule-info", projectId, definitionId],
    queryFn: async () => {
      const response =
        await apiService.get<ScheduleInfo | null>(
          `/api/benchmark/projects/${projectId}/definitions/${definitionId}/schedule`,
        );
      return response.data;
    },
    enabled: !!projectId && !!definitionId,
  });
}
