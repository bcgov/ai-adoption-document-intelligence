import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import type { AllGroupsSummaryItemDto } from "./dto/all-groups-summary-item.dto";
import type { GroupActivityHistoryItemDto } from "./dto/group-activity-history-item.dto";
import type { GroupUsageHistoryItemDto } from "./dto/group-usage-history-item.dto";
import type { GroupUsageSummaryDto } from "./dto/group-usage-summary.dto";
import type {
  ActivityCostItemDto,
  RateVersionDto,
} from "./dto/rate-version.dto";
import type { RunDetailDto } from "./dto/run-detail.dto";

const TERMINAL_EVENT_TYPES = new Set([
  "workflow_completed",
  "workflow_failed",
  "workflow_cancelled",
]);

/**
 * Read-only queries for usage data: current summaries, historical periods,
 * per-run cost breakdowns, cross-group admin views, and rate version data.
 */
@Injectable()
export class UsageQueryService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Returns the current calendar-month usage summary for a group, including
   * cap status, remaining budget, and a burn-rate-based exhaustion projection.
   * Returns zeros for spend and units when no UsagePeriodSummary row exists yet.
   *
   * @param groupId - The group to query.
   */
  async getGroupCurrentSummary(groupId: string): Promise<GroupUsageSummaryDto> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const [summary, billingConfig] = await Promise.all([
      this.prismaService.prisma.usagePeriodSummary.findUnique({
        where: {
          group_id_period_year_period_month: {
            group_id: groupId,
            period_year: year,
            period_month: month,
          },
        },
      }),
      this.prismaService.prisma.groupBillingConfig.findUnique({
        where: { group_id: groupId },
      }),
    ]);

    const totalSpent = summary ? summary.total_dollars_spent.toNumber() : 0;
    const totalUnits = summary ? summary.total_units_consumed.toNumber() : 0;
    const cap =
      billingConfig?.monthly_cap_dollars != null
        ? billingConfig.monthly_cap_dollars.toNumber()
        : null;

    const remaining = cap !== null ? Math.max(0, cap - totalSpent) : null;

    return {
      group_id: groupId,
      period_year: year,
      period_month: month,
      total_units_consumed: totalUnits,
      total_dollars_spent: totalSpent,
      monthly_cap_dollars: cap,
      remaining_dollars: remaining,
    };
  }

  /**
   * Returns all historical billing period summaries for a group, ordered
   * most-recent first.
   *
   * @param groupId - The group to query.
   */
  async getGroupHistory(groupId: string): Promise<GroupUsageHistoryItemDto[]> {
    const rows = await this.prismaService.prisma.usagePeriodSummary.findMany({
      where: { group_id: groupId },
      orderBy: [{ period_year: "desc" }, { period_month: "desc" }],
    });

    return rows.map((r) => ({
      period_year: r.period_year,
      period_month: r.period_month,
      total_units_consumed: r.total_units_consumed.toNumber(),
      total_dollars_spent: r.total_dollars_spent.toNumber(),
    }));
  }

  /**
   * Returns per-activity spend broken down by calendar month for a group.
   * Each row represents one activity name in one billing period.
   * Events with no activity name are grouped under "other".
   * Results are ordered by period ascending, then activity name ascending.
   *
   * @param groupId - The group to query.
   */
  async getGroupActivityHistory(
    groupId: string,
  ): Promise<GroupActivityHistoryItemDto[]> {
    const events = await this.prismaService.prisma.usageEvent.findMany({
      where: { group_id: groupId },
      select: {
        activity_name: true,
        units_consumed: true,
        created_at: true,
        rate_version: { select: { unit_cost_dollars: true } },
        event_type: true,
      },
      orderBy: { created_at: "asc" },
    });

    // Aggregate into a map keyed by "year-month-activity"
    const map = new Map<
      string,
      {
        period_year: number;
        period_month: number;
        activity_name: string;
        units: number;
        dollars: number;
        event_type: string;
      }
    >();

    for (const e of events) {
      const year = e.created_at.getUTCFullYear();
      const month = e.created_at.getUTCMonth() + 1;
      const activity = e.activity_name ?? "other";
      const event = e.event_type;
      const key = `${year}-${month}-${event}`;
      const existing = map.get(key);
      const units = e.units_consumed.toNumber();
      const dollars = units * e.rate_version.unit_cost_dollars.toNumber();
      if (existing) {
        existing.units += units;
        existing.dollars += dollars;
      } else {
        map.set(key, {
          period_year: year,
          period_month: month,
          activity_name: activity,
          event_type: event,
          units,
          dollars,
        });
      }
    }

    return [...map.values()]
      .sort((a, b) =>
        a.period_year !== b.period_year
          ? a.period_year - b.period_year
          : a.period_month !== b.period_month
            ? a.period_month - b.period_month
            : a.activity_name.localeCompare(b.activity_name),
      )
      .map((v) => ({
        period_year: v.period_year,
        period_month: v.period_month,
        activity_name: v.activity_name,
        units_consumed: v.units,
        dollars_spent: v.dollars,
        event_type: v.event_type,
      }));
  }

  /**
   * Returns the full per-event cost breakdown for a single workflow execution.
   * Throws NotFoundException when no events exist for the execution ID and
   * ForbiddenException when the run belongs to a different group.
   *
   * @param groupId - Expected group owner of the run.
   * @param workflowExecutionId - Temporal workflow execution ID.
   */
  async getRunDetail(
    groupId: string,
    workflowExecutionId: string,
  ): Promise<RunDetailDto> {
    const events = await this.prismaService.prisma.usageEvent.findMany({
      where: { workflow_execution_id: workflowExecutionId },
      include: { rate_version: true },
      orderBy: { created_at: "asc" },
    });

    if (events.length === 0) {
      throw new NotFoundException(
        `No usage events found for execution ${workflowExecutionId}`,
      );
    }

    const ownerGroupId = events[0].group_id;
    if (ownerGroupId !== groupId) {
      throw new ForbiddenException(
        "This workflow execution does not belong to the specified group.",
      );
    }

    const startedEvent = events.find(
      (e) => e.event_type === "workflow_started",
    );
    const terminalEvent = events.find((e) =>
      TERMINAL_EVENT_TYPES.has(e.event_type),
    );

    return {
      workflow_execution_id: workflowExecutionId,
      group_id: groupId,
      estimated_units: startedEvent?.estimated_units?.toNumber() ?? null,
      total_units_consumed: terminalEvent?.units_consumed.toNumber() ?? null,
      events: events.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        activity_name: e.activity_name,
        units_consumed: e.units_consumed.toNumber(),
        dollar_value:
          e.units_consumed.toNumber() *
          e.rate_version.unit_cost_dollars.toNumber(),
        metered_quantity: e.metered_quantity,
        estimated_units: e.estimated_units?.toNumber() ?? null,
        created_at: e.created_at,
      })),
    };
  }

  /**
   * Returns the current-month spend summary for every non-deleted group,
   * using a LEFT JOIN approach: groups with no activity appear with zero spend.
   * Results are ordered alphabetically by group name.
   */
  async getAllGroupsSummary(): Promise<AllGroupsSummaryItemDto[]> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const [groups, summaries, configs] = await Promise.all([
      this.prismaService.prisma.group.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.prismaService.prisma.usagePeriodSummary.findMany({
        where: { period_year: year, period_month: month },
      }),
      this.prismaService.prisma.groupBillingConfig.findMany(),
    ]);

    const summaryMap = new Map(summaries.map((s) => [s.group_id, s]));
    const configMap = new Map(configs.map((c) => [c.group_id, c]));

    return groups.map((group) => {
      const summary = summaryMap.get(group.id);
      const config = configMap.get(group.id);
      const spent = summary ? summary.total_dollars_spent.toNumber() : 0;
      const cap =
        config?.monthly_cap_dollars != null
          ? config.monthly_cap_dollars.toNumber()
          : null;
      const usagePct =
        cap !== null && cap > 0
          ? Math.round((spent / cap) * 10_000) / 100
          : null;

      return {
        group_id: group.id,
        group_name: group.name,
        total_dollars_spent: spent,
        monthly_cap_dollars: cap,
        usage_percentage: usagePct,
      };
    });
  }

  /**
   * Returns all rate versions ordered by effective date descending.
   */
  async getRateVersions(): Promise<RateVersionDto[]> {
    const versions = await this.prismaService.prisma.rateVersion.findMany({
      orderBy: { effective_from: "desc" },
    });

    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      effective_from: v.effective_from,
      unit_cost_dollars: v.unit_cost_dollars.toNumber(),
      units_per_gb_per_month: v.units_per_gb_per_month.toNumber(),
      max_pages_assumption: v.max_pages_assumption,
      max_array_items_assumption: v.max_array_items_assumption,
      created_at: v.created_at,
    }));
  }

  /**
   * Returns all activity cost rows for a specific rate version.
   * Throws NotFoundException when the version does not exist.
   *
   * @param versionId - Rate version ID.
   */
  async getRateVersionActivityCosts(
    versionId: string,
  ): Promise<ActivityCostItemDto[]> {
    const [version, costs] = await Promise.all([
      this.prismaService.prisma.rateVersion.findUnique({
        where: { id: versionId },
        select: { id: true },
      }),
      this.prismaService.prisma.activityCost.findMany({
        where: { rate_version_id: versionId },
        orderBy: { activity_name: "asc" },
      }),
    ]);

    if (!version) {
      throw new NotFoundException(`Rate version ${versionId} not found`);
    }

    return costs.map((c) => ({
      id: c.id,
      activity_name: c.activity_name,
      cost_type: c.cost_type,
      units: c.units.toNumber(),
    }));
  }
}
