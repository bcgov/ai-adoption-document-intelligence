import { GroupRole } from "@generated/client";
import { Controller, Get, Param } from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Identity } from "@/auth/identity.decorator";
import { AllGroupsSummaryItemDto } from "./dto/all-groups-summary-item.dto";
import { GroupActivityHistoryItemDto } from "./dto/group-activity-history-item.dto";
import { GroupUsageHistoryItemDto } from "./dto/group-usage-history-item.dto";
import { GroupUsageSummaryDto } from "./dto/group-usage-summary.dto";
import { ActivityCostItemDto, RateVersionDto } from "./dto/rate-version.dto";
import { RunDetailDto } from "./dto/run-detail.dto";
import { UsageQueryService } from "./usage-query.service";

/**
 * Usage endpoints for group admins and platform admins.
 * All routes live under /api/usage.
 * - Group-scoped routes require group ADMIN membership (system admins bypass).
 * - All-groups summary requires system admin.
 * - Rate version routes are accessible to any authenticated user.
 */
@ApiTags("Usage")
@Controller("api/usage")
export class UsageController {
  constructor(private readonly usageQueryService: UsageQueryService) {}

  /**
   * Get current-month spend summary for all groups.
   * System admin only.
   * GET /api/usage/summary
   */
  @ApiOperation({
    summary:
      "Get current-month spend summary for all groups (system admin only)",
  })
  @ApiOkResponse({
    description:
      "All active groups with their current-month spend and cap data.",
    type: [AllGroupsSummaryItemDto],
  })
  @ApiForbiddenResponse({ description: "Caller is not a system admin." })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @Identity({ requireSystemAdmin: true })
  @Get("summary")
  async getAllGroupsUsageSummary(): Promise<AllGroupsSummaryItemDto[]> {
    return this.usageQueryService.getAllGroupsSummary();
  }

  /**
   * Get the current billing period summary for a group.
   * Accessible to group admins and system admins.
   * GET /api/usage/groups/:groupId/summary
   */
  @ApiOperation({ summary: "Get current-month usage summary for a group" })
  @ApiOkResponse({
    description: "Current billing period summary including cap status.",
    type: GroupUsageSummaryDto,
  })
  @ApiForbiddenResponse({
    description: "Caller is not a group admin or system admin.",
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({
    groupIdFrom: { param: "groupId" },
    minimumRole: GroupRole.ADMIN,
  })
  @Get("groups/:groupId/summary")
  async getGroupUsageSummary(
    @Param("groupId") groupId: string,
  ): Promise<GroupUsageSummaryDto> {
    return this.usageQueryService.getGroupCurrentSummary(groupId);
  }

  /**
   * Get historical billing period summaries for a group, most-recent first.
   * Accessible to group admins and system admins (system admins can query any group).
   * GET /api/usage/groups/:groupId/history
   */
  @ApiOperation({
    summary: "Get historical monthly usage summaries for a group",
  })
  @ApiOkResponse({
    description: "Historical period summaries ordered most-recent first.",
    type: [GroupUsageHistoryItemDto],
  })
  @ApiForbiddenResponse({
    description: "Caller is not a group admin or system admin.",
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({
    groupIdFrom: { param: "groupId" },
    minimumRole: GroupRole.ADMIN,
  })
  @Get("groups/:groupId/history")
  async getGroupUsageHistory(
    @Param("groupId") groupId: string,
  ): Promise<GroupUsageHistoryItemDto[]> {
    return this.usageQueryService.getGroupHistory(groupId);
  }

  /**
   * Get per-activity spend broken down by calendar month for a group.
   * Each entry represents one activity in one billing period.
   * Accessible to group admins and system admins.
   * GET /api/usage/groups/:groupId/activity-history
   */
  @ApiOperation({
    summary: "Get per-activity monthly spend breakdown for a group",
  })
  @ApiOkResponse({
    description:
      "Activity-level spend per period, ordered by period then activity name.",
    type: [GroupActivityHistoryItemDto],
  })
  @ApiForbiddenResponse({
    description: "Caller is not a group admin or system admin.",
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({
    groupIdFrom: { param: "groupId" },
    minimumRole: GroupRole.ADMIN,
  })
  @Get("groups/:groupId/activity-history")
  async getGroupActivityHistory(
    @Param("groupId") groupId: string,
  ): Promise<GroupActivityHistoryItemDto[]> {
    return this.usageQueryService.getGroupActivityHistory(groupId);
  }

  /**
   * Get the full per-event cost breakdown for a specific workflow execution.
   * Accessible to group admins and system admins.
   * GET /api/usage/groups/:groupId/runs/:workflowExecutionId
   */
  @ApiOperation({
    summary: "Get cost breakdown for a specific workflow run",
  })
  @ApiOkResponse({
    description: "Full cost detail for the workflow execution.",
    type: RunDetailDto,
  })
  @ApiForbiddenResponse({
    description:
      "Caller is not a group admin, or the run belongs to a different group.",
  })
  @ApiNotFoundResponse({
    description: "No usage events found for the specified execution ID.",
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @ApiParam({
    name: "workflowExecutionId",
    description: "Temporal workflow execution ID",
    type: String,
  })
  @Identity({
    groupIdFrom: { param: "groupId" },
    minimumRole: GroupRole.ADMIN,
  })
  @Get("groups/:groupId/runs/:workflowExecutionId")
  async getRunDetail(
    @Param("groupId") groupId: string,
    @Param("workflowExecutionId") workflowExecutionId: string,
  ): Promise<RunDetailDto> {
    return this.usageQueryService.getRunDetail(groupId, workflowExecutionId);
  }

  /**
   * Get all rate versions ordered by effective date descending.
   * Accessible to any authenticated user so group admins can review current pricing.
   * GET /api/usage/rate-versions
   */
  @ApiOperation({
    summary: "Get all rate versions with their billing configuration",
  })
  @ApiOkResponse({
    description: "All rate versions ordered by effective date descending.",
    type: [RateVersionDto],
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @Identity()
  @Get("rate-versions")
  async getRateVersions(): Promise<RateVersionDto[]> {
    return this.usageQueryService.getRateVersions();
  }

  /**
   * Get activity cost table for a specific rate version.
   * Accessible to any authenticated user.
   * GET /api/usage/rate-versions/:versionId/activity-costs
   */
  @ApiOperation({
    summary: "Get activity cost table for a specific rate version",
  })
  @ApiOkResponse({
    description: "Activity costs for the specified rate version.",
    type: [ActivityCostItemDto],
  })
  @ApiNotFoundResponse({ description: "Rate version not found." })
  @ApiUnauthorizedResponse({ description: "Unauthorized." })
  @ApiParam({ name: "versionId", description: "Rate version ID", type: String })
  @Identity()
  @Get("rate-versions/:versionId/activity-costs")
  async getRateVersionActivityCosts(
    @Param("versionId") versionId: string,
  ): Promise<ActivityCostItemDto[]> {
    return this.usageQueryService.getRateVersionActivityCosts(versionId);
  }
}
