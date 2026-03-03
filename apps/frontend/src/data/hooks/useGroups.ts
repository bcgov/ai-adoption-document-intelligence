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

/** A single member of a group, returned by GET /api/groups/:groupId/members */
export interface GroupMember {
  userId: string;
  email: string;
  joinedAt: string;
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

/** A single membership request for a group, returned by GET /api/groups/:groupId/requests */
export interface GroupRequest {
  id: string;
  userId: string;
  email: string;
  groupId: string;
  status: string;
  actorId?: string;
  reason?: string;
  resolvedAt?: string;
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
 * Fetches all membership requests for a specific group, optionally filtered by status,
 * via GET /api/groups/:groupId/requests.
 * Only accessible by group admins and system admins.
 *
 * @param groupId - The ID of the group whose requests to fetch.
 * @param status - Optional status filter (PENDING, APPROVED, DENIED, CANCELLED).
 * @returns A react-query result containing the list of group membership requests.
 */
export function useGroupRequests(groupId: string, status?: string) {
  return useQuery({
    queryKey: ["groups", groupId, "requests", status],
    queryFn: async (): Promise<GroupRequest[]> => {
      const params = status ? `?status=${status}` : "";
      const response = await apiService.get<GroupRequest[]>(
        `/groups/${groupId}/requests${params}`,
      );
      if (!response.success) {
        throw new Error(
          response.message ?? "Failed to fetch group membership requests",
        );
      }
      return response.data ?? [];
    },
    enabled: !!groupId,
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

/**
 * Fetches all members of a group via GET /api/groups/:groupId/members.
 *
 * @param groupId - The ID of the group whose members to fetch.
 * @returns A react-query result containing the list of group members.
 */
export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: ["groups", groupId, "members"],
    queryFn: async (): Promise<GroupMember[]> => {
      const response = await apiService.get<GroupMember[]>(
        `/groups/${groupId}/members`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch group members");
      }
      return response.data ?? [];
    },
  });
}

/**
 * Removes a member from a group via DELETE /api/groups/:groupId/members/:userId.
 * Invalidates the members query for the group on success.
 *
 * @returns A react-query mutation result.
 */
export function useRemoveGroupMember(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string): Promise<{ success: boolean }> => {
      const response = await apiService.delete<{ success: boolean }>(
        `/groups/${groupId}/members/${userId}`,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message ?? "Failed to remove group member");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["groups", groupId, "members"],
      });
    },
  });
}

/**
 * Removes the authenticated user from a group via DELETE /api/groups/:groupId/leave.
 * Invalidates all group-related queries on success.
 *
 * @param groupId - The ID of the group to leave.
 * @returns A react-query mutation result.
 */
export function useLeaveGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await apiService.delete<{ success: boolean }>(
        `/groups/${groupId}/leave`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to leave group");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
