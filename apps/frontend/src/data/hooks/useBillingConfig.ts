import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

/** Billing configuration for a group, as returned by the admin API. */
export interface GroupBillingConfig {
  id: string;
  group_id: string;
  monthly_cap_dollars: number | null;
  cap_configured_by: string | null;
  cap_configured_at: string | null;
  created_at: string;
}

/** Payload for setting or clearing a group's spending cap. */
export interface SetBillingCapPayload {
  monthly_cap_dollars: number | null;
}

/**
 * Fetches the billing configuration for a specific group.
 *
 * @param groupId - The group ID to look up.
 */
export function useGroupBillingConfig(groupId: string) {
  return useQuery({
    queryKey: ["billing-config", groupId],
    queryFn: async (): Promise<GroupBillingConfig | null> => {
      const response = await apiService.get<GroupBillingConfig | null>(
        `/groups/${groupId}/billing-config`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch billing config");
      }
      return response.data ?? null;
    },
    enabled: !!groupId,
  });
}

/**
 * Mutation to set or remove the monthly spending cap for a group.
 *
 * @param groupId - The group ID to configure.
 */
export function useSetBillingCap(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: SetBillingCapPayload,
    ): Promise<GroupBillingConfig> => {
      const response = await apiService.patch<GroupBillingConfig>(
        `/groups/${groupId}/billing-config`,
        payload,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to update billing config");
      }
      return response.data as GroupBillingConfig;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["billing-config", groupId],
      });
    },
  });
}
