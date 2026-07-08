import { useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api.service";

/** Current-month usage summary for a group. */
export interface GroupUsageSummary {
  group_id: string;
  period_year: number;
  period_month: number;
  total_units_consumed: number;
  total_dollars_spent: number;
  monthly_cap_dollars: number | null;
  remaining_dollars: number | null;
}

/** A single historical billing period for a group. */
export interface GroupUsageHistoryItem {
  period_year: number;
  period_month: number;
  total_units_consumed: number;
  total_dollars_spent: number;
}

/** A single usage event within a run cost breakdown. */
export interface RunDetailEvent {
  id: string;
  event_type: string;
  activity_name: string | null;
  units_consumed: number;
  dollar_value: number;
  metered_quantity: number | null;
  estimated_units: number | null;
  created_at: string;
}

/** Full per-run cost breakdown. */
export interface RunDetail {
  workflow_execution_id: string;
  group_id: string;
  estimated_units: number | null;
  total_units_consumed: number | null;
  events: RunDetailEvent[];
}

/** Current-month summary for a single group in the platform admin view. */
export interface AllGroupsSummaryItem {
  group_id: string;
  group_name: string;
  total_dollars_spent: number;
  monthly_cap_dollars: number | null;
  usage_percentage: number | null;
}

/** A rate version record. */
export interface RateVersion {
  id: string;
  version: string;
  effective_from: string;
  unit_cost_dollars: number;
  units_per_gb_per_month: number;
  max_pages_assumption: number;
  max_array_items_assumption: number;
  created_at: string;
}

/** An activity cost entry within a rate version. */
export interface ActivityCostItem {
  id: string;
  activity_name: string;
  cost_type: string;
  units: number;
}

/**
 * Fetches the current-month usage summary for a group.
 * Accessible to group admins and system admins.
 *
 * @param groupId - The group to query.
 */
export function useGroupUsageSummary(groupId: string) {
  return useQuery({
    queryKey: ["usage-summary", groupId],
    queryFn: async (): Promise<GroupUsageSummary> => {
      const response = await apiService.get<GroupUsageSummary>(
        `/usage/groups/${groupId}/summary`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch usage summary");
      }
      return response.data as GroupUsageSummary;
    },
    enabled: !!groupId,
  });
}

/**
 * Fetches historical billing period summaries for a group.
 * Accessible to group admins and system admins.
 *
 * @param groupId - The group to query.
 */
export function useGroupUsageHistory(groupId: string) {
  return useQuery({
    queryKey: ["usage-history", groupId],
    queryFn: async (): Promise<GroupUsageHistoryItem[]> => {
      const response = await apiService.get<GroupUsageHistoryItem[]>(
        `/usage/groups/${groupId}/history`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch usage history");
      }
      return response.data ?? [];
    },
    enabled: !!groupId,
  });
}

/**
 * Fetches the current-month spend summary for all groups.
 * System admin only.
 */
export function useAllGroupsUsageSummary() {
  return useQuery({
    queryKey: ["admin-usage-summary"],
    queryFn: async (): Promise<AllGroupsSummaryItem[]> => {
      const response =
        await apiService.get<AllGroupsSummaryItem[]>("/usage/summary");
      if (!response.success) {
        throw new Error(
          response.message ?? "Failed to fetch all groups summary",
        );
      }
      return response.data ?? [];
    },
  });
}

/**
 * Fetches the full usage history for a specific group (platform admin drill-down).
 * System admin only.
 *
 * @param groupId - The group to query, or null to skip.
 */
export function useGroupHistoryForAdmin(groupId: string | null) {
  return useQuery({
    queryKey: ["admin-group-history", groupId],
    queryFn: async (): Promise<GroupUsageHistoryItem[]> => {
      const response = await apiService.get<GroupUsageHistoryItem[]>(
        `/usage/groups/${groupId as string}/history`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch group history");
      }
      return response.data ?? [];
    },
    enabled: !!groupId,
  });
}

/** A single activity-level spend record for one billing period. */
export interface GroupActivityHistoryItem {
  period_year: number;
  period_month: number;
  activity_name: string;
  units_consumed: number;
  dollars_spent: number;
  event_type: string;
}

/**
 * Fetches per-activity monthly spend breakdown for a group.
 * Accessible to group admins and system admins.
 *
 * @param groupId - The group to query.
 */
export function useGroupActivityHistory(groupId: string) {
  return useQuery({
    queryKey: ["activity-history", groupId],
    queryFn: async (): Promise<GroupActivityHistoryItem[]> => {
      const response = await apiService.get<GroupActivityHistoryItem[]>(
        `/usage/groups/${groupId}/activity-history`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch activity history");
      }
      return response.data ?? [];
    },
    enabled: !!groupId,
  });
}

/**
 * Fetches all rate versions ordered by effective date descending.
 * Accessible to any authenticated user.
 */
export function useRateVersions() {
  return useQuery({
    queryKey: ["rate-versions"],
    queryFn: async (): Promise<RateVersion[]> => {
      const response = await apiService.get<RateVersion[]>(
        "/usage/rate-versions",
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch rate versions");
      }
      return response.data ?? [];
    },
  });
}

/**
 * Fetches activity costs for a specific rate version.
 * Accessible to any authenticated user.
 *
 * @param versionId - Rate version ID, or null to skip the query.
 */
export function useRateVersionActivityCosts(versionId: string | null) {
  return useQuery({
    queryKey: ["rate-version-costs", versionId],
    queryFn: async (): Promise<ActivityCostItem[]> => {
      const response = await apiService.get<ActivityCostItem[]>(
        `/usage/rate-versions/${versionId as string}/activity-costs`,
      );
      if (!response.success) {
        throw new Error(response.message ?? "Failed to fetch activity costs");
      }
      return response.data ?? [];
    },
    enabled: !!versionId,
  });
}
