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
   * @param startDate - An optional start date.
   * @param endDate - An optional end date.
   */
  async getGroupActivityHistory(
    groupId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<GroupActivityHistoryItemDto[]> {
    // Default to a 24-month lookback when no start date is given so the query
    // is bounded even for the "all time" view. This matches the retention policy.
    const effectiveStart =
      startDate ??
      (() => {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - 24);
        d.setUTCDate(1);
        d.setUTCHours(0, 0, 0, 0);
        return d;
      })();
    const events = await this.prismaService.prisma.usageEvent.findMany({
      where: {
        group_id: groupId,
        created_at: {
          gte: effectiveStart,
          lte: endDate,
        },
      },
      select: {
        activity_name: true,
        units_consumed: true,
        created_at: true,
        rate_version: { select: { unit_cost_dollars: true } },
        event_type: true,
        workflow_version_id: true,
      },
      orderBy: { created_at: "asc" },
    });

    // Aggregate into a map keyed by "year-month-activity"
    interface ActivityBucket {
      units_consumed: number;
      dollars_spent: number;
    }
    interface EventBucket {
      event_type: string;
      units_consumed: number;
      dollars_spent: number;
      period_year: number;
      period_month: number;
      activities: Map<string, ActivityBucket>;
    }
    const map = new Map<string, EventBucket>();

    for (const e of events) {
      if (e.units_consumed.equals(0)) continue;
      const year = e.created_at.getUTCFullYear();
      const month = e.created_at.getUTCMonth() + 1;
      const activity =
        (e.event_type === "workflow_cost"
          ? e.workflow_version_id
          : e.activity_name) ?? "other";
      const event = e.event_type;
      const key = `${year}-${month}-${event}-${e.workflow_version_id}`;
      const units = e.units_consumed.toNumber();
      const dollars = units * e.rate_version.unit_cost_dollars.toNumber();
      // Does this event entry exist?
      const eventEntry = map.get(key);

      if (eventEntry) {
        eventEntry.units_consumed += units;
        eventEntry.dollars_spent += dollars;
        // Then does the activity entry exist?
        const activityEntry = eventEntry.activities.get(activity);
        if (activityEntry) {
          activityEntry.units_consumed += units;
          activityEntry.dollars_spent += dollars;
        } else {
          // Add a new activity to the activities map for this entry
          eventEntry.activities.set(activity, {
            units_consumed: units,
            dollars_spent: dollars,
          });
        }
      } else {
        const activitiesMap = new Map();
        activitiesMap.set(activity, {
          units_consumed: units,
          dollars_spent: dollars,
        });
        map.set(key, {
          period_year: year,
          period_month: month,
          activities: activitiesMap,
          event_type: event,
          units_consumed: units,
          dollars_spent: dollars,
        });
      }
    }

    return [...map.values()]
      .sort((a, b) =>
        a.period_year !== b.period_year
          ? a.period_year - b.period_year
          : a.period_month !== b.period_month
            ? a.period_month - b.period_month
            : a.event_type.localeCompare(b.event_type),
      )
      .map((v) => ({
        period_year: v.period_year,
        period_month: v.period_month,
        activities: Object.fromEntries(v.activities),
        units_consumed: v.units_consumed,
        dollars_spent: v.dollars_spent,
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
    const event = await this.prismaService.prisma.usageEvent.findFirst({
      where: {
        workflow_execution_id: workflowExecutionId,
        event_type: "workflow_cost",
      },
      include: { rate_version: true },
    });

    if (!event) {
      throw new NotFoundException(
        `No usage events found for execution ${workflowExecutionId}`,
      );
    }

    const ownerGroupId = event.group_id;
    if (ownerGroupId !== groupId) {
      throw new ForbiddenException(
        "This workflow execution does not belong to the specified group.",
      );
    }

    return {
      workflow_execution_id: workflowExecutionId,
      group_id: groupId,
      estimated_units: event.estimated_units?.toNumber() ?? null,
      total_units_consumed: event.units_consumed.toNumber() ?? null,
      id: event.id,
      event_type: event.event_type,
      activity_name: event.activity_name,
      units_consumed: event.units_consumed.toNumber(),
      dollar_value:
        event.units_consumed.toNumber() *
        event.rate_version.unit_cost_dollars.toNumber(),
      metered_quantity: event.metered_quantity,
      created_at: event.created_at,
      workflow_version_id: event.workflow_version_id ?? "",
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
