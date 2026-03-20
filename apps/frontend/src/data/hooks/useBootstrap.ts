import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

interface BootstrapStatus {
  needed: boolean;
  eligible: boolean;
}

interface BootstrapResult {
  success: boolean;
  groupId: string;
  groupName: string;
}

/**
 * Checks whether system bootstrap is needed and if the current user is eligible.
 * Only enabled when the user has no groups and is not a system admin.
 */
export function useBootstrapStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["bootstrap", "status"],
    queryFn: async (): Promise<BootstrapStatus> => {
      const response =
        await apiService.get<BootstrapStatus>("/bootstrap/status");
      if (!response.success) {
        throw new Error(response.message ?? "Failed to check bootstrap status");
      }
      return response.data ?? { needed: false, eligible: false };
    },
    enabled,
  });
}

/**
 * Performs the system bootstrap: promotes user to admin and creates Default group.
 * On success, invalidates auth and group queries so the UI refreshes.
 */
export function usePerformBootstrap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BootstrapResult> => {
      const response = await apiService.post<BootstrapResult>("/bootstrap", {});
      if (!response.success || !response.data) {
        throw new Error(response.message ?? "Failed to perform bootstrap");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
