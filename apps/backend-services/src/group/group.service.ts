import { $Enums, GroupRole } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { getRequestContext } from "../logging/request-context";
import { GroupMemberDto } from "./dto/group-member.dto";
import { GroupMembershipRequestDto } from "./dto/group-membership-request.dto";
import { MyMembershipRequestDto } from "./dto/my-membership-request.dto";
import { UserGroupDto } from "./dto/user-group.dto";

@Injectable()
export class GroupService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
  ) {}
  /**
   * Soft-deletes an existing group by ID.
   * Sets `deleted_at` to the current timestamp and `deleted_by` to the caller's userId.
   * Only system admins may perform this operation.
   * @param groupId - The ID of the group to soft-delete.
   * @param callerId - The ID of the user performing the deletion.
   */
  async deleteGroup(groupId: string, callerId: string): Promise<void> {
    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      throw new ForbiddenException("Only system admins can delete groups");
    }
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    await this.databaseService.prisma.group.update({
      where: { id: groupId },
      data: { deleted_at: new Date(), deleted_by: callerId },
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "group_deleted",
      resource_type: "group",
      resource_id: groupId,
      actor_id: callerId,
      group_id: groupId,
      request_id: requestContext?.requestId,
      payload: { group_name: group.name },
    });
    this.logger.log("Group soft-deleted", {
      groupId,
      groupName: group.name,
      actorId: callerId,
    });
  }

  /**
   * Returns all existing non-deleted groups.
   */
  async getAllGroups(): Promise<
    Array<{ id: string; name: string; description?: string }>
  > {
    return await this.databaseService.prisma.group.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Returns all non-deleted groups a user is a member of, including their role in each group.
   * Access is controlled based on the caller's role:
   * - System admins can view all groups for any user.
   * - The user themselves can view all their own groups.
   * - Group admins (admin role in any group) can only see groups where both the caller and the target user are members.
   * - Regular members cannot view another user's group memberships.
   * @param callerId - The ID of the caller making the request.
   * @param userId - The ID of the user whose groups are being retrieved.
   */
  async getUserGroups(
    callerId: string,
    userId: string,
  ): Promise<UserGroupDto[]> {
    if (callerId === userId) {
      return this.fetchUserGroups(userId);
    }

    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (isSystemAdmin) {
      return this.fetchUserGroups(userId);
    }

    const callerAdminMemberships =
      await this.databaseService.prisma.userGroup.findMany({
        where: { user_id: callerId, role: GroupRole.ADMIN },
      });

    if (callerAdminMemberships.length === 0) {
      throw new ForbiddenException(
        "You do not have permission to view another user's group memberships",
      );
    }

    const callerGroupIds = callerAdminMemberships.map((m) => m.group_id);
    const userGroups = await this.databaseService.prisma.userGroup.findMany({
      where: {
        user_id: userId,
        group_id: { in: callerGroupIds },
        group: { deleted_at: null },
      },
      include: { group: true },
    });
    return userGroups.map((ug) => ({
      id: ug.group.id,
      name: ug.group.name,
      role: ug.role,
      description: ug.group.description ?? undefined,
    }));
  }

  /**
   * Fetches all non-deleted groups a user belongs to with their role in each group.
   * @param userId - The ID of the user whose groups to fetch.
   */
  private async fetchUserGroups(userId: string): Promise<UserGroupDto[]> {
    const userGroups = await this.databaseService.prisma.userGroup.findMany({
      where: { user_id: userId, group: { deleted_at: null } },
      include: { group: true },
    });
    return userGroups.map((ug) => ({
      id: ug.group.id,
      name: ug.group.name,
      role: ug.role,
      description: ug.group.description ?? undefined,
    }));
  }

  /**
   * Allows a user to request membership to a group.
   * - Returns silently if the user is already a member.
   * - Returns silently if a PENDING request already exists.
   * - Throws NotFoundException if the group does not exist.
   * @param userId - The ID of the requesting user (from JWT sub claim).
   * @param groupId - The ID of the group to request membership for.
   */
  async requestMembership(userId: string, groupId: string): Promise<void> {
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const existingMembership =
      await this.databaseService.prisma.userGroup.findUnique({
        where: { user_id_group_id: { user_id: userId, group_id: groupId } },
      });
    if (existingMembership) {
      throw new BadRequestException("User is already a member of this group");
    }

    const existingRequest =
      await this.databaseService.prisma.groupMembershipRequest.findFirst({
        where: {
          user_id: userId,
          group_id: groupId,
          status: $Enums.GroupMembershipRequestStatus.PENDING,
        },
      });
    if (existingRequest) {
      throw new BadRequestException(
        "A pending membership request already exists for this group",
      );
    }

    const created =
      await this.databaseService.prisma.groupMembershipRequest.create({
        data: {
          user_id: userId,
          group_id: groupId,
          status: $Enums.GroupMembershipRequestStatus.PENDING,
          created_by: userId,
          updated_by: userId,
        },
      });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "membership_request_created",
      resource_type: "group_membership_request",
      resource_id: created.id,
      actor_id: userId,
      group_id: groupId,
      request_id: requestContext?.requestId,
      payload: { user_id: userId, group_id: groupId },
    });
    this.logger.log("Membership request created", {
      requestId: created.id,
      userId,
      groupId,
    });
  }
  /**
   * Cancels a pending group membership request made by the given user.
   * - Throws NotFoundException if the request does not exist.
   * - Throws ForbiddenException if the request belongs to a different user.
   * - Throws BadRequestException if the request is not in PENDING state.
   * @param userId - The ID of the requesting user (from JWT sub claim).
   * @param requestId - The ID of the membership request to cancel.
   * @param reason - Optional reason for cancellation.
   */
  async cancelMembershipRequest(
    userId: string,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    const request = await this.getValidPendingRequest(requestId, "cancelled");
    if (request.user_id !== userId) {
      throw new ForbiddenException(
        "Cannot cancel a request belonging to another user",
      );
    }
    await this.databaseService.prisma.groupMembershipRequest.update({
      where: { id: requestId },
      data: this.buildResolutionData(
        userId,
        $Enums.GroupMembershipRequestStatus.CANCELLED,
        reason,
      ),
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "membership_request_cancelled",
      resource_type: "group_membership_request",
      resource_id: requestId,
      actor_id: userId,
      group_id: request.group_id,
      request_id: requestContext?.requestId,
      payload: { reason },
    });
    this.logger.log("Membership request cancelled", {
      requestId,
      userId,
      groupId: request.group_id,
    });
  }

  /**
   * Approves a pending group membership request, atomically adding the user
   * to the group and updating the request status within a single transaction.
   * - Throws NotFoundException if the request does not exist.
   * - Throws BadRequestException if the request is not in PENDING state.
   * - Throws ForbiddenException if the caller is not a group admin or system admin.
   * @param adminId - The ID of the approving admin (from JWT sub claim).
   * @param requestId - The ID of the membership request to approve.
   * @param reason - Optional reason for approval.
   */
  async approveMembershipRequest(
    adminId: string,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    const request = await this.getValidPendingRequest(requestId, "approved");
    await this.checkGroupAdminOrSystemAdmin(adminId, request.group_id);
    await this.databaseService.prisma.$transaction([
      this.databaseService.prisma.userGroup.upsert({
        where: {
          user_id_group_id: {
            user_id: request.user_id,
            group_id: request.group_id,
          },
        },
        update: {},
        create: {
          user_id: request.user_id,
          group_id: request.group_id,
        },
      }),
      this.databaseService.prisma.groupMembershipRequest.update({
        where: { id: requestId },
        data: this.buildResolutionData(
          adminId,
          $Enums.GroupMembershipRequestStatus.APPROVED,
          reason,
        ),
      }),
    ]);
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "membership_request_approved",
      resource_type: "group_membership_request",
      resource_id: requestId,
      actor_id: adminId,
      group_id: request.group_id,
      request_id: requestContext?.requestId,
      payload: {
        user_id: request.user_id,
        reason,
      },
    });
    await this.auditService.recordEvent({
      event_type: "member_added",
      resource_type: "user_group",
      resource_id: `${request.user_id}:${request.group_id}`,
      actor_id: adminId,
      group_id: request.group_id,
      request_id: requestContext?.requestId,
      payload: { user_id: request.user_id, membership_request_id: requestId },
    });
    this.logger.log("Membership request approved, user added to group", {
      requestId,
      adminId,
      userId: request.user_id,
      groupId: request.group_id,
    });
  }

  /**
   * Denies a pending group membership request without adding the user to the group.
   * - Throws NotFoundException if the request does not exist.
   * - Throws BadRequestException if the request is not in PENDING state.
   * - Throws ForbiddenException if the caller is not a group admin or system admin.
   * @param adminId - The ID of the denying admin (from JWT sub claim).
   * @param requestId - The ID of the membership request to deny.
   * @param reason - Optional reason for denial.
   */
  async denyMembershipRequest(
    adminId: string,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    const request = await this.getValidPendingRequest(requestId, "denied");
    await this.checkGroupAdminOrSystemAdmin(adminId, request.group_id);
    await this.databaseService.prisma.groupMembershipRequest.update({
      where: { id: requestId },
      data: this.buildResolutionData(
        adminId,
        $Enums.GroupMembershipRequestStatus.DENIED,
        reason,
      ),
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "membership_request_denied",
      resource_type: "group_membership_request",
      resource_id: requestId,
      actor_id: adminId,
      group_id: request.group_id,
      request_id: requestContext?.requestId,
      payload: { user_id: request.user_id, reason },
    });
    this.logger.log("Membership request denied", {
      requestId,
      adminId,
      userId: request.user_id,
      groupId: request.group_id,
    });
  }

  /**
   * Validates that the caller is either a system admin or a group admin for the given group.
   * Throws ForbiddenException if neither condition is met.
   * @param callerId - The ID of the caller.
   * @param groupId - The ID of the group to check admin membership for.
   */
  private async checkGroupAdminOrSystemAdmin(
    callerId: string,
    groupId: string,
  ): Promise<void> {
    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (isSystemAdmin) return;

    const callerMembership =
      await this.databaseService.prisma.userGroup.findUnique({
        where: {
          user_id_group_id: { user_id: callerId, group_id: groupId },
        },
      });
    if (callerMembership?.role !== GroupRole.ADMIN) {
      throw new ForbiddenException(
        "Only group admins or system admins can approve or deny membership requests",
      );
    }
  }

  /**
   * Fetches a membership request by ID and validates it is in PENDING state.
   * @param requestId - The ID of the membership request.
   * @param action - Verb describing the intended action (e.g. "approved"), used in error messages.
   * @throws NotFoundException if the request does not exist.
   * @throws BadRequestException if the request is not in PENDING state.
   */
  private async getValidPendingRequest(requestId: string, action: string) {
    const request =
      await this.databaseService.prisma.groupMembershipRequest.findUnique({
        where: { id: requestId },
      });
    if (!request) {
      throw new NotFoundException("Membership request not found");
    }
    if (request.status !== $Enums.GroupMembershipRequestStatus.PENDING) {
      throw new BadRequestException(`Only PENDING requests can be ${action}`);
    }
    return request;
  }

  /**
   * Builds the data payload for resolving a membership request.
   * @param actorId - The ID of the user performing the action.
   * @param status - The new status to set on the request.
   * @param reason - Optional reason for the action.
   */
  private buildResolutionData(
    actorId: string,
    status: $Enums.GroupMembershipRequestStatus,
    reason?: string,
  ) {
    return {
      status,
      actor_id: actorId,
      resolved_at: new Date(),
      updated_by: actorId,
      ...(reason !== undefined ? { reason } : {}),
    };
  }

  /**
   * Creates a new group with the given name and optional description.
   * Only system admins are permitted to create groups.
   * Throws ForbiddenException if the caller is not a system admin.
   * Throws ConflictException if a group with the same name already exists.
   * @param callerId - The ID of the caller (from resolvedIdentity.userId).
   * @param name - The name of the new group.
   * @param description - Optional description for the group.
   */
  async createGroup(
    callerId: string,
    name: string,
    description?: string,
  ): Promise<{ id: string; name: string; description: string | null }> {
    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      throw new ForbiddenException("Only system admins can create groups");
    }

    const existing = await this.databaseService.prisma.group.findUnique({
      where: { name },
    });
    if (existing) {
      throw new ConflictException("Group with this name already exists");
    }

    const group = await this.databaseService.prisma.group.create({
      data: { name, ...(description !== undefined ? { description } : {}) },
      select: { id: true, name: true, description: true },
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "group_created",
      resource_type: "group",
      resource_id: group.id,
      actor_id: callerId,
      group_id: group.id,
      request_id: requestContext?.requestId,
      payload: { name: group.name, description: group.description ?? undefined },
    });
    this.logger.log("Group created", {
      groupId: group.id,
      name: group.name,
      actorId: callerId,
    });
    return group;
  }

  /**
   * Updates an existing group's name and optional description.
   * Only system admins are permitted to update groups.
   * Throws ForbiddenException if the caller is not a system admin.
   * Throws NotFoundException if the group does not exist or has been soft-deleted.
   * Throws ConflictException if another group already uses the provided name.
   * @param callerId - The ID of the caller (from resolvedIdentity.userId).
   * @param groupId - The ID of the group to update.
   * @param name - The new name for the group.
   * @param description - Optional new description for the group.
   */
  async updateGroup(
    callerId: string,
    groupId: string,
    name: string,
    description?: string,
  ): Promise<{ id: string; name: string; description: string | null }> {
    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      throw new ForbiddenException("Only system admins can update groups");
    }

    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId, deleted_at: null },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const duplicate = await this.databaseService.prisma.group.findFirst({
      where: { name, id: { not: groupId }, deleted_at: null },
    });
    if (duplicate) {
      throw new ConflictException("Group with this name already exists");
    }

    const updated = await this.databaseService.prisma.group.update({
      where: { id: groupId },
      data: {
        name,
        description: description ?? null,
        updated_by: callerId,
      },
      select: { id: true, name: true, description: true },
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "group_updated",
      resource_type: "group",
      resource_id: groupId,
      actor_id: callerId,
      group_id: groupId,
      request_id: requestContext?.requestId,
      payload: { name: updated.name, description: updated.description ?? undefined },
    });
    this.logger.log("Group updated", {
      groupId,
      name: updated.name,
      actorId: callerId,
    });
    return updated;
  }

  async assignUserToGroup(
    callerId: string,
    userId: string,
    groupId: string,
  ): Promise<void> {
    // Validate the group exists
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      const isMember = await this.databaseService.isUserInGroup(
        callerId,
        groupId,
      );
      if (!isMember) {
        throw new ForbiddenException(
          "You do not have permission to view members of this group",
        );
      }
    }

    // Upsert user-group mapping
    await this.databaseService.prisma.userGroup.upsert({
      where: {
        user_id_group_id: {
          user_id: userId,
          group_id: groupId,
        },
      },
      update: {},
      create: {
        user_id: userId,
        group_id: groupId,
      },
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "member_added",
      resource_type: "user_group",
      resource_id: `${userId}:${groupId}`,
      actor_id: callerId,
      group_id: groupId,
      request_id: requestContext?.requestId,
      payload: { user_id: userId },
    });
    this.logger.log("User added to group", {
      userId,
      groupId,
      actorId: callerId,
    });
  }

  /**
   * Returns the list of members for a given group.
   * Authorization: the caller must be a member of the group or a system admin.
   * - System admins always have access.
   * - Regular members and group admins (users with any role in UserGroup) have read access.
   * - Non-members receive a 403 Forbidden.
   * @param callerId - The user ID of the caller (from resolvedIdentity.userId).
   * @param groupId - The ID of the group whose members are being retrieved.
   * @returns An array of GroupMemberDto objects representing the group's members.
   * @throws NotFoundException when the group does not exist.
   * @throws ForbiddenException when the caller is not a member or system admin.
   */
  async getGroupMembers(
    callerId: string,
    groupId: string,
  ): Promise<GroupMemberDto[]> {
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId, deleted_at: null },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      const isMember = await this.databaseService.isUserInGroup(
        callerId,
        groupId,
      );
      if (!isMember) {
        throw new ForbiddenException(
          "You do not have permission to view members of this group",
        );
      }
    }

    const members = await this.databaseService.prisma.userGroup.findMany({
      where: { group_id: groupId },
      include: { user: true },
    });

    return members.map((m) => ({
      userId: m.user_id,
      email: m.user?.email ?? "",
      joinedAt: m.created_at,
    }));
  }

  /**
   * Removes the calling user from a group they are a member of.
   * Throws BadRequestException if the caller is not a member of the group.
   * @param userId - The ID of the user leaving the group (from resolvedIdentity.userId).
   * @param groupId - The ID of the group to leave.
   */
  async leaveGroup(userId: string, groupId: string): Promise<void> {
    const membership = await this.databaseService.prisma.userGroup.findUnique({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    if (!membership) {
      throw new BadRequestException("User is not a member of this group");
    }
    await this.databaseService.prisma.userGroup.delete({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "user_left_group",
      resource_type: "user_group",
      resource_id: `${userId}:${groupId}`,
      actor_id: userId,
      group_id: groupId,
      request_id: requestContext?.requestId,
    });
    this.logger.log("User left group", { userId, groupId });
  }

  /**
   * Returns all membership requests for a group, with optional status filtering.
   * Authorization: the caller must be a group admin (UserGroup record with role = ADMIN) or a system admin.
   * @param callerId - The ID of the caller (from resolvedIdentity.userId).
   * @param groupId - The ID of the group whose requests are being retrieved.
   * @param status - Optional status filter; when provided only requests matching the status are returned.
   * @returns An array of GroupMembershipRequestDto objects.
   * @throws NotFoundException when the group does not exist.
   * @throws ForbiddenException when the caller is not a group admin or system admin.
   */
  async getGroupRequests(
    callerId: string,
    groupId: string,
    status?: $Enums.GroupMembershipRequestStatus,
  ): Promise<GroupMembershipRequestDto[]> {
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId, deleted_at: null },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      const callerMembership =
        await this.databaseService.prisma.userGroup.findUnique({
          where: {
            user_id_group_id: { user_id: callerId, group_id: groupId },
          },
        });
      if (callerMembership?.role !== GroupRole.ADMIN) {
        throw new ForbiddenException(
          "Only group admins or system admins can view membership requests",
        );
      }
    }

    const requests =
      await this.databaseService.prisma.groupMembershipRequest.findMany({
        where: {
          group_id: groupId,
          ...(status !== undefined ? { status } : {}),
        },
        include: { user: true },
      });

    return requests.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.user?.email ?? "",
      groupId: r.group_id,
      status: r.status,
      actorId: r.actor_id ?? undefined,
      reason: r.reason ?? undefined,
      resolvedAt: r.resolved_at ?? undefined,
      createdAt: r.created_at,
    }));
  }

  /**
   * Returns all membership requests made by the given user across all groups, with optional status filtering.
   * @param userId - The ID of the requesting user (from resolvedIdentity.userId).
   * @param status - Optional status filter; when provided only requests matching the status are returned.
   * @returns An array of MyMembershipRequestDto objects.
   */
  async getMyRequests(
    userId: string,
    status?: $Enums.GroupMembershipRequestStatus,
  ): Promise<MyMembershipRequestDto[]> {
    const requests =
      await this.databaseService.prisma.groupMembershipRequest.findMany({
        where: {
          user_id: userId,
          ...(status !== undefined ? { status } : {}),
        },
        include: { group: { select: { name: true } } },
      });

    return requests.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      groupName: r.group.name,
      status: r.status,
      reason: r.reason ?? undefined,
      createdAt: r.created_at,
    }));
  }

  /**
   * Removes a user from a group, with authorization enforcement.
   * The caller must be a group admin (UserGroup record with role = ADMIN) or a system admin.
   * Throws NotFoundException if the group does not exist.
   * Throws ForbiddenException if the caller lacks the required role.
   * Throws NotFoundException if the target user is not a member of the group.
   * @param callerId - The ID of the user performing the removal (from resolvedIdentity.userId).
   * @param groupId - The ID of the group.
   * @param userId - The ID of the user to remove.
   */
  async removeGroupMember(
    callerId: string,
    groupId: string,
    userId: string,
  ): Promise<void> {
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const isSystemAdmin =
      await this.databaseService.isUserSystemAdmin(callerId);
    if (!isSystemAdmin) {
      const callerMembership =
        await this.databaseService.prisma.userGroup.findUnique({
          where: {
            user_id_group_id: { user_id: callerId, group_id: groupId },
          },
        });
      if (callerMembership?.role !== GroupRole.ADMIN) {
        throw new ForbiddenException(
          "Only group admins or system admins can remove members",
        );
      }
    }

    const targetMembership =
      await this.databaseService.prisma.userGroup.findUnique({
        where: {
          user_id_group_id: { user_id: userId, group_id: groupId },
        },
      });
    if (!targetMembership) {
      throw new NotFoundException("User is not a member of this group");
    }

    await this.databaseService.prisma.userGroup.delete({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    const requestContext = getRequestContext();
    await this.auditService.recordEvent({
      event_type: "member_removed",
      resource_type: "user_group",
      resource_id: `${userId}:${groupId}`,
      actor_id: callerId,
      group_id: groupId,
      request_id: requestContext?.requestId,
      payload: { removed_user_id: userId },
    });
    this.logger.log("Member removed from group", {
      groupId,
      removedUserId: userId,
      actorId: callerId,
    });
  }
}
