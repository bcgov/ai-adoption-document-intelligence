import { $Enums, GroupRole, UserGroup } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { ResolvedIdentity } from "@/auth/types";
import { AuditService } from "../audit/audit.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { GroupMemberDto } from "./dto/group-member.dto";
import { GroupMembershipRequestDto } from "./dto/group-membership-request.dto";
import { MyMembershipRequestDto } from "./dto/my-membership-request.dto";
import { UserGroupDto } from "./dto/user-group.dto";
import { GroupDbService } from "./group-db.service";

@Injectable()
export class GroupService {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
    private readonly groupDb: GroupDbService,
  ) {}

  /**
   * Returns all UserGroup records for a given user.
   * @param userId - The ID of the user whose group memberships to retrieve.
   * @returns An array of UserGroup records.
   */
  async findUsersGroups(userId: string): Promise<UserGroup[]> {
    return this.groupDb.findUsersGroups(userId);
  }

  /**
   * Checks whether a user is a member of a given group.
   * @param userId - The ID of the user to check.
   * @param groupId - The ID of the group to check membership in.
   * @returns `true` when the user is a member, `false` otherwise.
   */
  async isUserInGroup(userId: string, groupId: string): Promise<boolean> {
    return this.groupDb.isUserInGroup(userId, groupId);
  }

  /**
   * Checks whether a user is a system admin.
   * @param userId - The ID of the user to check.
   * @returns `true` when the user has `is_system_admin` set to `true`, `false` otherwise.
   */
  async isUserSystemAdmin(userId: string): Promise<boolean> {
    return this.groupDb.isUserSystemAdmin(userId);
  }
  /**
   * Soft-deletes an existing group by ID.
   * Sets `deleted_at` to the current timestamp and `deleted_by` to the caller's userId.
   * @param groupId - The ID of the group to soft-delete.
   * @param callerId - The ID of the user performing the deletion.
   */
  async deleteGroup(groupId: string, callerId: string): Promise<void> {
    const group = await this.groupDb.findGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    await this.groupDb.softDeleteGroup(groupId, callerId);
    await this.auditService.recordEvent({
      event_type: "group_deleted",
      resource_type: "group",
      resource_id: groupId,
      actor_id: callerId,
      group_id: groupId,
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
    return await this.groupDb.findAllGroups();
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
    identity: ResolvedIdentity,
    userId: string,
  ): Promise<UserGroupDto[]> {
    if (identity.userId === userId) {
      return this.fetchUserGroups(userId);
    }

    if (identity.isSystemAdmin) {
      return this.fetchUserGroups(userId);
    }

    const callerAdminMemberships = await this.groupDb.findUserAdminMemberships(
      identity.userId!,
    );

    if (callerAdminMemberships.length === 0) {
      throw new ForbiddenException(
        "You do not have permission to view another user's group memberships",
      );
    }

    const callerGroupIds = callerAdminMemberships.map((m) => m.group_id);
    const userGroups = await this.groupDb.findUserGroupsInGroups(
      userId,
      callerGroupIds,
    );
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
    const userGroups = await this.groupDb.findUserGroupsWithGroup(userId);
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
    const group = await this.groupDb.findGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const existingMembership = await this.groupDb.findUserGroupMembership(
      userId,
      groupId,
    );
    if (existingMembership) {
      throw new BadRequestException("User is already a member of this group");
    }

    const existingRequest = await this.groupDb.findPendingMembershipRequest(
      userId,
      groupId,
    );
    if (existingRequest) {
      throw new BadRequestException(
        "A pending membership request already exists for this group",
      );
    }

    const created = await this.groupDb.createMembershipRequest(userId, groupId);
    await this.auditService.recordEvent({
      event_type: "membership_request_created",
      resource_type: "group_membership_request",
      resource_id: created.id,
      actor_id: userId,
      group_id: groupId,
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
    await this.groupDb.updateMembershipRequest(
      requestId,
      this.buildResolutionData(
        userId,
        $Enums.GroupMembershipRequestStatus.CANCELLED,
        reason,
      ),
    );
    await this.auditService.recordEvent({
      event_type: "membership_request_cancelled",
      resource_type: "group_membership_request",
      resource_id: requestId,
      actor_id: userId,
      group_id: request.group_id,
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
   * @param identity - The resolved identity of the caller.
   * @param requestId - The ID of the membership request to approve.
   * @param reason - Optional reason for approval.
   */
  async approveMembershipRequest(
    identity: ResolvedIdentity,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    const request = await this.getValidPendingRequest(requestId, "approved");
    identityCanAccessGroup(identity, request.group_id, GroupRole.ADMIN);
    await this.groupDb.approveRequestTransaction(
      request.user_id,
      request.group_id,
      requestId,
      this.buildResolutionData(
        identity.userId!,
        $Enums.GroupMembershipRequestStatus.APPROVED,
        reason,
      ),
    );
    await this.auditService.recordEvent({
      event_type: "membership_request_approved",
      resource_type: "group_membership_request",
      resource_id: requestId,
      actor_id: identity.userId,
      group_id: request.group_id,
      payload: {
        user_id: request.user_id,
        reason,
      },
    });
    await this.auditService.recordEvent({
      event_type: "member_added",
      resource_type: "user_group",
      resource_id: `${request.user_id}:${request.group_id}`,
      actor_id: identity.userId,
      group_id: request.group_id,
      payload: { user_id: request.user_id, membership_request_id: requestId },
    });
    this.logger.log("Membership request approved, user added to group", {
      requestId,
      actorId: identity.userId,
      userId: request.user_id,
      groupId: request.group_id,
    });
  }

  /**
   * Denies a pending group membership request without adding the user to the group.
   * - Throws NotFoundException if the request does not exist.
   * - Throws BadRequestException if the request is not in PENDING state.
   * - Throws ForbiddenException if the caller is not a group admin or system admin.
   * @param identity - The resolved identity of the caller.
   * @param requestId - The ID of the membership request to deny.
   * @param reason - Optional reason for denial.
   */
  async denyMembershipRequest(
    identity: ResolvedIdentity,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    const request = await this.getValidPendingRequest(requestId, "denied");
    identityCanAccessGroup(identity, request.group_id, GroupRole.ADMIN);
    await this.groupDb.updateMembershipRequest(
      requestId,
      this.buildResolutionData(
        identity.userId!,
        $Enums.GroupMembershipRequestStatus.DENIED,
        reason,
      ),
    );
    await this.auditService.recordEvent({
      event_type: "membership_request_denied",
      resource_type: "group_membership_request",
      resource_id: requestId,
      actor_id: identity.userId,
      group_id: request.group_id,
      payload: { user_id: request.user_id, reason },
    });
    this.logger.log("Membership request denied", {
      requestId,
      actorId: identity.userId,
      userId: request.user_id,
      groupId: request.group_id,
    });
  }

  /**
   * Fetches a membership request by ID and validates it is in PENDING state.
   * @param requestId - The ID of the membership request.
   * @param action - Verb describing the intended action (e.g. "approved"), used in error messages.
   * @throws NotFoundException if the request does not exist.
   * @throws BadRequestException if the request is not in PENDING state.
   */
  private async getValidPendingRequest(requestId: string, action: string) {
    const request = await this.groupDb.findMembershipRequest(requestId);
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
   * Authorization is enforced at the controller layer (system admins only).
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
    const existing = await this.groupDb.findGroupByName(name);
    if (existing) {
      throw new ConflictException("Group with this name already exists");
    }

    const group = await this.groupDb.createGroup(name, description);
    await this.auditService.recordEvent({
      event_type: "group_created",
      resource_type: "group",
      resource_id: group.id,
      actor_id: callerId,
      group_id: group.id,
      payload: {
        name: group.name,
        description: group.description ?? undefined,
      },
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
    const group = await this.groupDb.findActiveGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const duplicate = await this.groupDb.findActiveGroupByNameExcluding(
      name,
      groupId,
    );
    if (duplicate) {
      throw new ConflictException("Group with this name already exists");
    }

    const updated = await this.groupDb.updateGroupData(groupId, {
      name,
      description: description ?? null,
      updated_by: callerId,
    });
    await this.auditService.recordEvent({
      event_type: "group_updated",
      resource_type: "group",
      resource_id: groupId,
      actor_id: callerId,
      group_id: groupId,
      payload: {
        name: updated.name,
        description: updated.description ?? undefined,
      },
    });
    this.logger.log("Group updated", {
      groupId,
      name: updated.name,
      actorId: callerId,
    });
    return updated;
  }

  /**
   * Assigns a user to a group by creating a UserGroup record.
   * Throws NotFoundException if the group does not exist.
   * Idempotent: if the user is already a member, no error is thrown and the existing membership is left unchanged.
   * @param userId - The ID of the user to add to the group.
   * @param groupId - The ID of the group to add the user to.
   * @param identity - The resolved identity of the caller, used for audit logging.
   *                   Authorization is enforced at the controller layer (group admins or system admins only).
   * @returns void
   */
  async assignUserToGroup(
    userId: string,
    groupId: string,
    identity: ResolvedIdentity,
  ): Promise<void> {
    // Validate the group exists
    const group = await this.groupDb.findGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    // Upsert user-group mapping
    await this.groupDb.upsertUserGroup(userId, groupId);
    await this.auditService.recordEvent({
      event_type: "member_added",
      resource_type: "user_group",
      resource_id: `${userId}:${groupId}`,
      actor_id: identity.userId,
      group_id: groupId,
      payload: { user_id: userId },
    });
    this.logger.log("User added to group", {
      userId,
      groupId,
      actorId: identity.userId,
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
  async getGroupMembers(groupId: string): Promise<GroupMemberDto[]> {
    const group = await this.groupDb.findActiveGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const members = await this.groupDb.findGroupMembersWithUser(groupId);

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
    await this.groupDb.deleteUserGroup(userId, groupId);
    await this.auditService.recordEvent({
      event_type: "user_left_group",
      resource_type: "user_group",
      resource_id: `${userId}:${groupId}`,
      actor_id: userId,
      group_id: groupId,
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
    const group = await this.groupDb.findActiveGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const requests = await this.groupDb.findGroupMembershipRequests(
      groupId,
      status,
    );

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
    const requests = await this.groupDb.findUserMembershipRequests(
      userId,
      status,
    );

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
   * Removes a user from a group.
   * Throws NotFoundException if the group does not exist.
   * Throws NotFoundException if the target user is not a member of the group.
   * @param groupId - The ID of the group.
   * @param userId - The ID of the user to remove.
   * @param identity - The resolved identity of the caller.
   */
  async removeGroupMember(
    groupId: string,
    userId: string,
    identity: ResolvedIdentity,
  ): Promise<void> {
    const group = await this.groupDb.findGroup(groupId);
    if (!group) {
      throw new NotFoundException("Group not found");
    }

    const targetMembership = await this.groupDb.findUserGroupMembership(
      userId,
      groupId,
    );
    if (!targetMembership) {
      throw new NotFoundException("User is not a member of this group");
    }

    await this.groupDb.deleteUserGroup(userId, groupId);
    await this.auditService.recordEvent({
      event_type: "member_removed",
      resource_type: "user_group",
      resource_id: `${userId}:${groupId}`,
      actor_id: identity.userId,
      group_id: groupId,
      payload: { removed_user_id: userId },
    });
    this.logger.log("Member removed from group", {
      groupId,
      removedUserId: userId,
      actorId: identity.userId,
    });
  }
}
