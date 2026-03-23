import { $Enums, GroupRole } from "@generated/client";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { User } from "../auth/types";
import { CreateGroupDto } from "./dto/create-group.dto";
import { GroupMemberDto } from "./dto/group-member.dto";
import { GroupMembershipRequestDto } from "./dto/group-membership-request.dto";
import { MembershipRequestActionDto } from "./dto/membership-request-action.dto";
import { MyMembershipRequestDto } from "./dto/my-membership-request.dto";
import { RequestMembershipDto } from "./dto/request-membership.dto";
import { UpdateGroupDto } from "./dto/update-group.dto";
import { UserGroupDto } from "./dto/user-group.dto";
import { GroupService } from "./group.service";

/**
 * Controller for managing groups and group membership.
 */
@ApiTags("Group")
@Controller("api/groups")
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  /**
   * Soft-delete an existing group (system admin only)
   * DELETE /api/groups/:groupId
   */
  @ApiOperation({
    summary: "Soft-delete an existing group (system admin only)",
  })
  @ApiResponse({ status: 200, description: "Group soft-deleted successfully." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({ status: 403, description: "Caller is not a system admin." })
  @ApiResponse({ status: 404, description: "Group not found." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({ requireSystemAdmin: true })
  @Delete(":groupId")
  async deleteGroup(
    @Req() req: Request,
    @Param("groupId") groupId: string,
  ): Promise<{ success: boolean }> {
    const callerId = req.resolvedIdentity?.userId;
    await this.groupService.deleteGroup(groupId, callerId);
    return { success: true };
  }

  /**
   * Get all existing groups
   * GET /api/groups
   */
  @ApiOperation({ summary: "Get all existing groups" })
  @ApiResponse({ status: 200, description: "List of groups." })
  @Identity()
  @Get()
  async getAllGroups(): Promise<
    Array<{ id: string; name: string; description?: string }>
  > {
    return await this.groupService.getAllGroups();
  }

  /**
   * Get a user's group membership
   * GET /api/groups/user/:userId
   */
  @ApiOperation({ summary: "Get a user's group membership" })
  @ApiResponse({
    status: 200,
    description: "List of groups the user is a member of.",
    type: [UserGroupDto],
  })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({
    status: 403,
    description: "Caller does not have permission to view this user's groups.",
  })
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @Identity()
  @Get("/user/:userId")
  async getUserGroups(
    @Req() req: Request,
    @Param("userId") userId: string,
  ): Promise<UserGroupDto[]> {
    const identity = req.resolvedIdentity;
    return await this.groupService.getUserGroups(identity, userId);
  }

  /**
   * Request membership to a group
   * POST /api/groups/request
   */
  @ApiOperation({ summary: "Request membership to a group" })
  @ApiResponse({
    status: 200,
    description: "Membership requested successfully.",
  })
  @ApiResponse({ status: 404, description: "Group not found." })
  @Identity()
  @Post("/request")
  async requestMembership(
    @Req() req: Request & { user?: User },
    @Body() body: RequestMembershipDto,
  ): Promise<{ success: boolean }> {
    const userId = req.user?.sub;
    await this.groupService.requestMembership(
      userId,
      body.groupId,
      req.resolvedIdentity,
    );
    return { success: true };
  }

  /**
   * Get all membership requests made by the authenticated caller
   * GET /api/groups/requests/mine
   */
  @ApiOperation({ summary: "Get all membership requests made by the caller" })
  @ApiResponse({
    status: 200,
    description: "List of membership requests made by the caller.",
    type: [MyMembershipRequestDto],
  })
  @ApiResponse({ status: 400, description: "Invalid status query parameter." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @Identity()
  @Get("requests/mine")
  async getMyRequests(
    @Req() req: Request,
    @Query("status") status?: string,
  ): Promise<MyMembershipRequestDto[]> {
    const userId = req.resolvedIdentity?.userId;
    const validStatuses = Object.values($Enums.GroupMembershipRequestStatus);
    let parsedStatus: $Enums.GroupMembershipRequestStatus | undefined;
    if (status !== undefined) {
      if (
        !validStatuses.includes(status as $Enums.GroupMembershipRequestStatus)
      ) {
        throw new HttpException(
          `Invalid status value. Must be one of: ${validStatuses.join(", ")}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      parsedStatus = status as $Enums.GroupMembershipRequestStatus;
    }

    return await this.groupService.getMyRequests(userId, parsedStatus);
  }

  /**
   * Cancel a pending membership request
   * PATCH /api/groups/requests/:requestId/cancel
   */
  @ApiOperation({ summary: "Cancel a pending group membership request" })
  @ApiResponse({
    status: 200,
    description: "Membership request cancelled successfully.",
  })
  @ApiResponse({ status: 400, description: "Request is not in PENDING state." })
  @ApiResponse({
    status: 403,
    description: "Request belongs to a different user.",
  })
  @ApiResponse({ status: 404, description: "Membership request not found." })
  @ApiParam({
    name: "requestId",
    description: "Membership request ID",
    type: String,
  })
  @Identity()
  @Patch("requests/:requestId/cancel")
  async cancelMembershipRequest(
    @Req() req: Request & { user?: User },
    @Param("requestId") requestId: string,
    @Body() body: MembershipRequestActionDto,
  ): Promise<{ success: boolean }> {
    const userId = req.user?.sub;
    await this.groupService.cancelMembershipRequest(
      userId,
      requestId,
      body.reason,
    );
    return { success: true };
  }

  /**
   * Approve a pending membership request
   * PATCH /api/groups/requests/:requestId/approve
   */
  @ApiOperation({ summary: "Approve a pending group membership request" })
  @ApiResponse({
    status: 200,
    description: "Membership request approved successfully.",
  })
  @ApiResponse({ status: 400, description: "Request is not in PENDING state." })
  @ApiResponse({
    status: 403,
    description: "Caller is not a group admin or system admin.",
  })
  @ApiResponse({ status: 404, description: "Membership request not found." })
  @ApiParam({
    name: "requestId",
    description: "Membership request ID",
    type: String,
  })
  @Identity()
  @Patch("requests/:requestId/approve")
  async approveMembershipRequest(
    @Req() req: Request,
    @Param("requestId") requestId: string,
    @Body() body: MembershipRequestActionDto,
  ): Promise<{ success: boolean }> {
    const identity = req.resolvedIdentity;
    await this.groupService.approveMembershipRequest(
      identity,
      requestId,
      body.reason,
    );
    return { success: true };
  }

  /**
   * Deny a pending membership request
   * PATCH /api/groups/requests/:requestId/deny
   */
  @ApiOperation({ summary: "Deny a pending group membership request" })
  @ApiResponse({
    status: 200,
    description: "Membership request denied successfully.",
  })
  @ApiResponse({ status: 400, description: "Request is not in PENDING state." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({
    status: 403,
    description: "Caller is not a group admin or system admin.",
  })
  @ApiResponse({ status: 404, description: "Membership request not found." })
  @ApiParam({
    name: "requestId",
    description: "Membership request ID",
    type: String,
  })
  @Identity()
  @Patch("requests/:requestId/deny")
  async denyMembershipRequest(
    @Req() req: Request,
    @Param("requestId") requestId: string,
    @Body() body: MembershipRequestActionDto,
  ): Promise<{ success: boolean }> {
    const identity = req.resolvedIdentity;
    await this.groupService.denyMembershipRequest(
      identity,
      requestId,
      body.reason,
    );
    return { success: true };
  }

  /**
   * Update an existing group's name and description (system admin only)
   * PATCH /api/groups/:groupId
   */
  @ApiOperation({ summary: "Update an existing group (system admin only)" })
  @ApiResponse({
    status: 200,
    description: "Group updated successfully.",
  })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({
    status: 403,
    description: "Caller is not a system admin.",
  })
  @ApiResponse({ status: 404, description: "Group not found." })
  @ApiResponse({
    status: 409,
    description: "A group with the given name already exists.",
  })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({ groupIdFrom: { param: "groupId" }, minimumRole: GroupRole.ADMIN })
  @Patch(":groupId")
  async updateGroup(
    @Req() req: Request,
    @Param("groupId") groupId: string,
    @Body() body: UpdateGroupDto,
  ): Promise<{ id: string; name: string; description: string | null }> {
    const callerId = req.resolvedIdentity?.userId;
    return await this.groupService.updateGroup(
      callerId,
      groupId,
      body.name,
      body.description,
    );
  }

  /**
   * Create a new group (system admin only)
   * POST /api/groups
   */
  @ApiOperation({ summary: "Create a new group (system admin only)" })
  @ApiResponse({ status: 201, description: "Group created successfully." })
  @ApiResponse({ status: 400, description: "Invalid input." })
  @ApiResponse({ status: 401, description: "Unauthorized." })
  @ApiResponse({
    status: 403,
    description: "Caller is not a system admin.",
  })
  @ApiResponse({
    status: 409,
    description: "A group with the given name already exists.",
  })
  @Identity({ requireSystemAdmin: true })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async createGroup(
    @Req() req: Request,
    @Body() body: CreateGroupDto,
  ): Promise<{ id: string; name: string; description: string | null }> {
    const callerId = req.resolvedIdentity?.userId;
    return await this.groupService.createGroup(
      callerId,
      body.name,
      body.description,
    );
  }

  /**
   * Assign a user to a group
   * POST /api/groups/:groupId/members/:userId
   */
  @ApiOperation({ summary: "Assign a user to a group" })
  @ApiResponse({
    status: 200,
    description: "User assigned to group successfully.",
  })
  @ApiResponse({ status: 400, description: "Invalid input." })
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({ groupIdFrom: { param: "groupId" }, minimumRole: GroupRole.ADMIN })
  @Post(":groupId/members/:userId")
  async addGroupMember(
    @Req() req: Request,
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
  ) {
    if (!groupId || typeof groupId !== "string") {
      throw new HttpException("Group ID is required", HttpStatus.BAD_REQUEST);
    }
    if (!userId || typeof userId !== "string") {
      throw new HttpException("User ID is required", HttpStatus.BAD_REQUEST);
    }

    await this.groupService.assignUserToGroup(
      userId,
      groupId,
      req.resolvedIdentity,
    );
    return { success: true };
  }

  /**
   * Get all membership requests for a group, with optional status filtering
   * GET /api/groups/:groupId/requests
   */
  @ApiOperation({
    summary: "Get membership requests for a group with optional status filter",
  })
  @ApiResponse({
    status: 200,
    description: "List of membership requests for the group.",
    type: [GroupMembershipRequestDto],
  })
  @ApiResponse({
    status: 400,
    description: "Invalid status query parameter.",
  })
  @ApiResponse({
    status: 403,
    description: "Caller is not a group admin or system admin.",
  })
  @ApiResponse({ status: 404, description: "Group not found." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @ApiQuery({
    name: "status",
    required: false,
    description:
      "Optional status to filter membership requests (PENDING, APPROVED, DENIED).",
  })
  @Identity({ groupIdFrom: { param: "groupId" }, minimumRole: GroupRole.ADMIN })
  @Get(":groupId/requests")
  async getGroupRequests(
    @Req() req: Request,
    @Param("groupId") groupId: string,
    @Query("status") status?: string,
  ): Promise<GroupMembershipRequestDto[]> {
    const callerId = req.resolvedIdentity?.userId;

    const validStatuses = Object.values($Enums.GroupMembershipRequestStatus);
    let parsedStatus: $Enums.GroupMembershipRequestStatus | undefined;
    if (status !== undefined) {
      if (
        !validStatuses.includes(status as $Enums.GroupMembershipRequestStatus)
      ) {
        throw new HttpException(
          `Invalid status value. Must be one of: ${validStatuses.join(", ")}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      parsedStatus = status as $Enums.GroupMembershipRequestStatus;
    }

    return await this.groupService.getGroupRequests(
      callerId,
      groupId,
      parsedStatus,
    );
  }

  /**
   * Get all members of a group
   * GET /api/groups/:groupId/members
   */
  @ApiOperation({ summary: "Get all members of a group" })
  @ApiResponse({
    status: 200,
    description: "List of group members.",
    type: [GroupMemberDto],
  })
  @ApiResponse({
    status: 403,
    description: "Caller is not a member of the group or a system admin.",
  })
  @ApiResponse({ status: 404, description: "Group not found." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({
    groupIdFrom: { param: "groupId" },
    minimumRole: GroupRole.MEMBER,
  })
  @Get(":groupId/members")
  async getGroupMembers(
    @Param("groupId") groupId: string,
  ): Promise<GroupMemberDto[]> {
    return await this.groupService.getGroupMembers(groupId);
  }

  /**
   * Remove a specific member from a group
   * DELETE /api/groups/:groupId/members/:userId
   */
  @ApiOperation({ summary: "Remove a member from a group" })
  @ApiResponse({
    status: 200,
    description: "Member removed from group successfully.",
  })
  @ApiResponse({
    status: 403,
    description: "Caller is not a group admin or system admin.",
  })
  @ApiResponse({
    status: 404,
    description: "Group not found or user is not a member.",
  })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @ApiParam({ name: "userId", description: "User ID to remove", type: String })
  @Identity({ groupIdFrom: { param: "groupId" }, minimumRole: GroupRole.ADMIN })
  @Delete(":groupId/members/:userId")
  async removeGroupMember(
    @Req() req: Request,
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
  ): Promise<{ success: boolean }> {
    await this.groupService.removeGroupMember(
      groupId,
      userId,
      req.resolvedIdentity,
    );
    return { success: true };
  }

  /**
   * Leave a group the caller is a member of
   * DELETE /api/groups/:groupId/leave
   */
  @ApiOperation({ summary: "Leave a group the caller belongs to" })
  @ApiResponse({
    status: 200,
    description: "Successfully left the group.",
  })
  @ApiResponse({
    status: 400,
    description: "Caller is not a member of the group.",
  })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Identity({
    groupIdFrom: { param: "groupId" },
    minimumRole: GroupRole.MEMBER,
  })
  @Delete(":groupId/leave")
  async leaveGroup(
    @Req() req: Request,
    @Param("groupId") groupId: string,
  ): Promise<{ success: boolean }> {
    const userId = req.resolvedIdentity?.userId;
    await this.groupService.leaveGroup(userId, groupId);
    return { success: true };
  }
}
