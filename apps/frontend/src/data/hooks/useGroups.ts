import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

/** Minimal group shape returned by GET /api/groups */
export interface GroupInfo {
  id: string;
  name: string;
}

/** Group membership for the current user, returned by GET /api/groups/user/:userId */
export interface UserGroup {
  id: string;
  name: string;
  role: string;
}

/** Membership request belonging to the authenticated caller, returned by GET /api/groups/requests/mine */
export interface MyMembershipRequest {
  id: string;
  groupId: string;
  groupName: string;
  status: string;
  reason?: string;
  createdAt: string;
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

/**
 * Fetches the groups a specific user belongs to via GET /api/groups/user/:userId.
 *
 * @param userId - The ID of the user whose groups to fetch.
 * @param options - Optional react-query options (e.g. `enabled`).
 * @returns A react-query result containing the list of groups the user belongs to.
 */
export function useMyGroups(userId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["groups", "user", userId],
    queryFn: async (): Promise<UserGroup[]> => {
      const response = await apiService.get<UserGroup[]>(
        `/groups/user/${userId}`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch user groups");
      }
      return response.data ?? [];
    },
    enabled: !!userId && (options?.enabled ?? true),
  });
}

/**
 * Fetches all membership requests belonging to the authenticated user,
 * optionally filtered by status, via GET /api/groups/requests/mine.
 *
 * @param status - Optional status filter (PENDING, APPROVED, DENIED, CANCELLED).
 * @returns A react-query result containing the list of membership requests.
 */
export function useMyRequests(status?: string) {
  return useQuery({
    queryKey: ["groups", "requests", "mine", status],
    queryFn: async (): Promise<MyMembershipRequest[]> => {
      const params = status ? `?status=${status}` : "";
      const response = await apiService.get<MyMembershipRequest[]>(
        `/groups/requests/mine${params}`,
      );
      if (!response.success) {
        throw new Error(
          response.message ?? "Failed to fetch membership requests",
        );
      }
      return response.data ?? [];
    },
  });
}

/**
 * Cancels a pending membership request for the authenticated user via
 * PATCH /api/groups/requests/:requestId/cancel.
 *
 * @returns A react-query mutation result. Invalidates the my-requests query on success.
 */
export function useCancelMembershipRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string): Promise<{ success: boolean }> => {
      const response = await apiService.patch<{ success: boolean }>(
        `/groups/requests/${requestId}/cancel`,
        {},
      );
      if (!response.success || !response.data) {
        throw new Error(
          response.message ?? "Failed to cancel membership request",
        );
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["groups", "requests", "mine"],
      });
    },
  });
}
