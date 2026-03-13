import type {
  $Enums,
  Group,
  GroupMembershipRequest,
  GroupRole,
  Prisma,
  PrismaClient,
  UserGroup,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class GroupDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  // ---- Group ----

  /**
   * Finds a group by ID (including soft-deleted groups).
   * @param id - The group ID.
   */
  async findGroup(id: string): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { id } });
  }

  /**
   * Finds a non-deleted group by ID.
   * @param id - The group ID.
   */
  async findActiveGroup(id: string): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { id, deleted_at: null } });
  }

  /**
   * Finds a group by name.
   * @param name - The group name.
   */
  async findGroupByName(name: string): Promise<Group | null> {
    return this.prisma.group.findUnique({ where: { name } });
  }

  /**
   * Finds a non-deleted group matching the given name, excluding a specific group ID.
   * Used for duplicate-name checks when updating a group.
   * @param name - The name to check.
   * @param excludeId - The group ID to exclude from the search.
   */
  async findActiveGroupByNameExcluding(
    name: string,
    excludeId: string,
  ): Promise<Group | null> {
    return this.prisma.group.findFirst({
      where: { name, id: { not: excludeId }, deleted_at: null },
    });
  }

  /**
   * Returns all non-deleted groups with their id, name, and description.
   */
  async findAllGroups(): Promise<
    Array<{ id: string; name: string; description: string | null }>
  > {
    return this.prisma.group.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Creates a new group.
   * @param name - The group name.
   * @param description - Optional description.
   */
  async createGroup(
    name: string,
    description?: string,
  ): Promise<{ id: string; name: string; description: string | null }> {
    return this.prisma.group.create({
      data: { name, ...(description !== undefined ? { description } : {}) },
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Updates a group's name, description, and updated_by fields.
   * @param id - The group ID.
   * @param data - The fields to update.
   */
  async updateGroupData(
    id: string,
    data: { name: string; description: string | null; updated_by: string },
  ): Promise<{ id: string; name: string; description: string | null }> {
    return this.prisma.group.update({
      where: { id },
      data,
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Soft-deletes a group by setting deleted_at and deleted_by.
   * @param id - The group ID.
   * @param deletedBy - The ID of the user performing the deletion.
   */
  async softDeleteGroup(id: string, deletedBy: string): Promise<void> {
    await this.prisma.group.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: deletedBy },
    });
  }

  // ---- UserGroup ----

  /**
   * Returns all UserGroup records for a given user.
   * @param userId - The ID of the user whose group memberships to retrieve.
   */
  async findUsersGroups(userId: string): Promise<UserGroup[]> {
    return this.prisma.userGroup.findMany({ where: { user_id: userId } });
  }

  /**
   * Returns all ADMIN-role UserGroup records for a given user.
   * @param userId - The user ID.
   */
  async findUserAdminMemberships(userId: string): Promise<UserGroup[]> {
    return this.prisma.userGroup.findMany({
      where: { user_id: userId, role: "ADMIN" as GroupRole },
    });
  }

  /**
   * Returns all non-deleted groups a user belongs to, including group data.
   * @param userId - The user ID.
   */
  async findUserGroupsWithGroup(
    userId: string,
  ): Promise<Prisma.UserGroupGetPayload<{ include: { group: true } }>[]> {
    return this.prisma.userGroup.findMany({
      where: { user_id: userId, group: { deleted_at: null } },
      include: { group: true },
    });
  }

  /**
   * Returns UserGroup records (with group data) for a user, filtered to a specific set of group IDs.
   * @param userId - The user ID.
   * @param groupIds - The allowed group IDs.
   */
  async findUserGroupsInGroups(
    userId: string,
    groupIds: string[],
  ): Promise<Prisma.UserGroupGetPayload<{ include: { group: true } }>[]> {
    return this.prisma.userGroup.findMany({
      where: {
        user_id: userId,
        group_id: { in: groupIds },
        group: { deleted_at: null },
      },
      include: { group: true },
    });
  }

  /**
   * Checks whether a user is a member of a given group.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   */
  async isUserInGroup(userId: string, groupId: string): Promise<boolean> {
    const entry = await this.prisma.userGroup.findUnique({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    return entry != null;
  }

  /**
   * Returns the UserGroup record for a specific user-group pair, or null if not found.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   */
  async findUserGroupMembership(
    userId: string,
    groupId: string,
  ): Promise<UserGroup | null> {
    return this.prisma.userGroup.findUnique({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  }

  /**
   * Upserts a UserGroup record, creating it if it does not exist.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   */
  async upsertUserGroup(userId: string, groupId: string): Promise<void> {
    await this.prisma.userGroup.upsert({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
      update: {},
      create: { user_id: userId, group_id: groupId },
    });
  }

  /**
   * Deletes a UserGroup record.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   */
  async deleteUserGroup(userId: string, groupId: string): Promise<void> {
    await this.prisma.userGroup.delete({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  }

  /**
   * Returns all members of a group, including user data.
   * @param groupId - The group ID.
   */
  async findGroupMembersWithUser(
    groupId: string,
  ): Promise<Prisma.UserGroupGetPayload<{ include: { user: true } }>[]> {
    return this.prisma.userGroup.findMany({
      where: { group_id: groupId },
      include: { user: true },
    });
  }

  /**
   * Checks whether a user is a system admin.
   * @param userId - The ID of the user to check.
   * @returns `true` when the user has `is_system_admin` set to `true`, `false` otherwise.
   */
  async isUserSystemAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { is_system_admin: true },
    });
    return user?.is_system_admin ?? false;
  }

  // ---- GroupMembershipRequest ----

  /**
   * Finds a membership request by ID.
   * @param id - The request ID.
   */
  async findMembershipRequest(
    id: string,
  ): Promise<GroupMembershipRequest | null> {
    return this.prisma.groupMembershipRequest.findUnique({ where: { id } });
  }

  /**
   * Finds the first PENDING membership request for a user in a group.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   */
  async findPendingMembershipRequest(
    userId: string,
    groupId: string,
  ): Promise<GroupMembershipRequest | null> {
    return this.prisma.groupMembershipRequest.findFirst({
      where: {
        user_id: userId,
        group_id: groupId,
        status: "PENDING" as $Enums.GroupMembershipRequestStatus,
      },
    });
  }

  /**
   * Creates a new PENDING membership request.
   * @param userId - The requesting user ID.
   * @param groupId - The target group ID.
   */
  async createMembershipRequest(
    userId: string,
    groupId: string,
  ): Promise<GroupMembershipRequest> {
    return this.prisma.groupMembershipRequest.create({
      data: {
        user_id: userId,
        group_id: groupId,
        status: "PENDING" as $Enums.GroupMembershipRequestStatus,
        created_by: userId,
        updated_by: userId,
      },
    });
  }

  /**
   * Updates a membership request with the provided data.
   * @param id - The request ID.
   * @param data - The fields to update.
   */
  async updateMembershipRequest(
    id: string,
    data: Prisma.GroupMembershipRequestUpdateInput,
  ): Promise<void> {
    await this.prisma.groupMembershipRequest.update({ where: { id }, data });
  }

  /**
   * Atomically approves a membership request: upserts the user into the group
   * and updates the request status within a single transaction.
   * @param requestUserId - The user ID from the request.
   * @param requestGroupId - The group ID from the request.
   * @param requestId - The membership request ID.
   * @param resolutionData - The update payload for the request record.
   */
  async approveRequestTransaction(
    requestUserId: string,
    requestGroupId: string,
    requestId: string,
    resolutionData: Prisma.GroupMembershipRequestUpdateInput,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userGroup.upsert({
        where: {
          user_id_group_id: {
            user_id: requestUserId,
            group_id: requestGroupId,
          },
        },
        update: {},
        create: { user_id: requestUserId, group_id: requestGroupId },
      }),
      this.prisma.groupMembershipRequest.update({
        where: { id: requestId },
        data: resolutionData,
      }),
    ]);
  }

  /**
   * Returns all membership requests for a group, optionally filtered by status.
   * Includes the requesting user's data.
   * @param groupId - The group ID.
   * @param status - Optional status filter.
   */
  async findGroupMembershipRequests(
    groupId: string,
    status?: $Enums.GroupMembershipRequestStatus,
  ): Promise<
    Prisma.GroupMembershipRequestGetPayload<{ include: { user: true } }>[]
  > {
    return this.prisma.groupMembershipRequest.findMany({
      where: { group_id: groupId, ...(status !== undefined ? { status } : {}) },
      include: { user: true },
    });
  }

  /**
   * Returns all membership requests made by a user, optionally filtered by status.
   * Includes the group name.
   * @param userId - The user ID.
   * @param status - Optional status filter.
   */
  async findUserMembershipRequests(
    userId: string,
    status?: $Enums.GroupMembershipRequestStatus,
  ): Promise<
    Prisma.GroupMembershipRequestGetPayload<{
      include: { group: { select: { name: true } } };
    }>[]
  > {
    return this.prisma.groupMembershipRequest.findMany({
      where: { user_id: userId, ...(status !== undefined ? { status } : {}) },
      include: { group: { select: { name: true } } },
    });
  }
}
