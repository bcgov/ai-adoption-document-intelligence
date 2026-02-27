import { useMutation, useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

/** Minimal group shape returned by GET /api/groups */
export interface GroupInfo {
  id: string;
  name: string;
}

/**
 * Fetches all available groups from the API.
 *
 * @returns A react-query result containing the list of all groups.
 */
export function useAllGroups() {
  return useQuery({
    queryKey: ["groups", "all"],
    queryFn: async (): Promise<GroupInfo[]> => {
      const response = await apiService.get<GroupInfo[]>("/groups");
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch groups");
      }
      return response.data ?? [];
    },
  });
}

export interface RequestMembershipPayload {
  groupId: string;
}

/**
 * Submits a membership request for the current authenticated user to the
 * specified group via POST /api/groups/request.
 *
 * @returns A react-query mutation result.
 */
export function useRequestMembership() {
  return useMutation({
    mutationFn: async (
      payload: RequestMembershipPayload,
    ): Promise<{ success: boolean }> => {
      const response = await apiService.post<{ success: boolean }>(
        "/groups/request",
        payload,
      );
      if (!response.success || !response.data) {
        throw new Error(
          response.message ?? "Failed to submit membership request",
        );
      }
      return response.data;
    },
  });
}
