import { $Enums } from "@generated/client";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { User } from "../auth/types";
import { GroupMemberDto } from "./dto/group-member.dto";
import { GroupMembershipRequestDto } from "./dto/group-membership-request.dto";
import { MembershipRequestActionDto } from "./dto/membership-request-action.dto";
import { RequestMembershipDto } from "./dto/request-membership.dto";
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
   * Delete an existing group
   * DELETE /api/groups/:groupId
   */
  @ApiOperation({ summary: "Delete an existing group" })
  @ApiResponse({ status: 200, description: "Group deleted successfully." })
  @ApiResponse({ status: 404, description: "Group not found." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @KeycloakSSOAuth()
  @Delete(":groupId")
  async deleteGroup(
    @Param("groupId") groupId: string,
  ): Promise<{ success: boolean }> {
    await this.groupService.deleteGroup(groupId);
    return { success: true };
  }

  /**
   * Get all existing groups
   * GET /api/groups
   */
  @ApiOperation({ summary: "Get all existing groups" })
  @ApiResponse({ status: 200, description: "List of groups." })
  @KeycloakSSOAuth()
  @Get()
  async getAllGroups(): Promise<Array<{ id: string; name: string }>> {
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
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @KeycloakSSOAuth()
  @Get("/user/:userId")
  async getUserGroups(
    @Param("userId") userId: string,
  ): Promise<UserGroupDto[]> {
    return await this.groupService.getUserGroups(userId);
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
  @KeycloakSSOAuth()
  @Post("/request")
  async requestMembership(
    @Req() req: Request & { user?: User },
    @Body() body: RequestMembershipDto,
  ): Promise<{ success: boolean }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    await this.groupService.requestMembership(userId, body.groupId);
    return { success: true };
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
  @KeycloakSSOAuth()
  @Patch("requests/:requestId/cancel")
  async cancelMembershipRequest(
    @Req() req: Request & { user?: User },
    @Param("requestId") requestId: string,
    @Body() body: MembershipRequestActionDto,
  ): Promise<{ success: boolean }> {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
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
  @KeycloakSSOAuth()
  @Patch("requests/:requestId/approve")
  async approveMembershipRequest(
    @Req() req: Request,
    @Param("requestId") requestId: string,
    @Body() body: MembershipRequestActionDto,
  ): Promise<{ success: boolean }> {
    const adminId = req.resolvedIdentity?.userId;
    if (!adminId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    await this.groupService.approveMembershipRequest(
      adminId,
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
  @KeycloakSSOAuth()
  @Patch("requests/:requestId/deny")
  async denyMembershipRequest(
    @Req() req: Request,
    @Param("requestId") requestId: string,
    @Body() body: MembershipRequestActionDto,
  ): Promise<{ success: boolean }> {
    const adminId = req.resolvedIdentity?.userId;
    if (!adminId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    await this.groupService.denyMembershipRequest(
      adminId,
      requestId,
      body.reason,
    );
    return { success: true };
  }

  /**
   * Create a new group
   * POST /api/groups
   */
  @ApiOperation({ summary: "Create a new group" })
  @ApiResponse({ status: 201, description: "Group created successfully." })
  @ApiResponse({ status: 400, description: "Invalid input." })
  @ApiBody({
    schema: {
      properties: { name: { type: "string", description: "Group name" } },
    },
  })
  @KeycloakSSOAuth()
  @Post()
  async createGroup(
    @Body("name") name: string,
  ): Promise<{ id: string; name: string }> {
    if (!name || typeof name !== "string") {
      throw new HttpException("Group name is required", HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.groupService.createGroup(name);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
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
  @ApiBody({
    schema: {
      properties: {
        groupIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of group IDs",
        },
      },
    },
  })
  @KeycloakSSOAuth()
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

    try {
      const callerId = req.resolvedIdentity?.userId;
      if (!callerId) {
        throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
      }
      await this.groupService.assignUserToGroup(callerId, userId, groupId);
      return { success: true };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
  @KeycloakSSOAuth()
  @Get(":groupId/requests")
  async getGroupRequests(
    @Req() req: Request,
    @Param("groupId") groupId: string,
    @Query("status") status?: string,
  ): Promise<GroupMembershipRequestDto[]> {
    const callerId = req.resolvedIdentity?.userId;
    if (!callerId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }

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
  @KeycloakSSOAuth()
  @Get(":groupId/members")
  async getGroupMembers(
    @Req() req: Request,
    @Param("groupId") groupId: string,
  ): Promise<GroupMemberDto[]> {
    const userId = req.resolvedIdentity?.userId;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    return await this.groupService.getGroupMembers(userId, groupId);
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
  @KeycloakSSOAuth()
  @Delete(":groupId/members/:userId")
  async removeGroupMember(
    @Req() req: Request,
    @Param("groupId") groupId: string,
    @Param("userId") userId: string,
  ): Promise<{ success: boolean }> {
    const callerId = req.resolvedIdentity?.userId;
    if (!callerId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    await this.groupService.removeGroupMember(callerId, groupId, userId);
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
  @KeycloakSSOAuth()
  @Delete(":groupId/leave")
  async leaveGroup(
    @Req() req: Request,
    @Param("groupId") groupId: string,
  ): Promise<{ success: boolean }> {
    const userId = req.resolvedIdentity?.userId;
    if (!userId) {
      throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    }
    await this.groupService.leaveGroup(userId, groupId);
    return { success: true };
  }
}
