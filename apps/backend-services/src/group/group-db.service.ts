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
import { ResolvedIdentity } from "@/auth/types";
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
   * @param tx - Optional. Prisma transaction client.
   */
  async findGroup(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Group | null> {
    const client = tx ?? this.prisma;
    return client.group.findUnique({ where: { id } });
  }

  /**
   * Finds a non-deleted group by ID.
   * @param id - The group ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findActiveGroup(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Group | null> {
    const client = tx ?? this.prisma;
    return client.group.findUnique({ where: { id, deleted_at: null } });
  }

  /**
   * Finds a group by name.
   * @param name - The group name.
   * @param tx - Optional. Prisma transaction client.
   */
  async findGroupByName(
    name: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Group | null> {
    const client = tx ?? this.prisma;
    return client.group.findUnique({ where: { name } });
  }

  /**
   * Finds a non-deleted group matching the given name, excluding a specific group ID.
   * Used for duplicate-name checks when updating a group.
   * @param name - The name to check.
   * @param excludeId - The group ID to exclude from the search.
   * @param tx - Optional. Prisma transaction client.
   */
  async findActiveGroupByNameExcluding(
    name: string,
    excludeId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Group | null> {
    const client = tx ?? this.prisma;
    return client.group.findFirst({
      where: { name, id: { not: excludeId }, deleted_at: null },
    });
  }

  /**
   * Returns all non-deleted groups with their id, name, and description.
   * @param tx - Optional. Prisma transaction client.
   */
  async findAllGroups(
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ id: string; name: string; description: string | null }>> {
    const client = tx ?? this.prisma;
    return client.group.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Creates a new group.
   * @param created_by_id - The actor ID or the requestor.
   * @param name - The group name.
   * @param description - Optional description.
   * @param tx - Optional. Prisma transaction client.
   */
  async createGroup(
    created_by_id: string,
    name: string,
    description?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; name: string; description: string | null }> {
    const client = tx ?? this.prisma;
    return client.group.create({
      data: {
        created_by: created_by_id,
        name,
        ...(description !== undefined ? { description } : {}),
      },
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Updates a group's name, description, and updated_by fields.
   * @param id - The group ID.
   * @param data - The fields to update.
   * @param tx - Optional. Prisma transaction client.
   */
  async updateGroupData(
    id: string,
    data: { name: string; description: string | null; updated_by: string },
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; name: string; description: string | null }> {
    const client = tx ?? this.prisma;
    return client.group.update({
      where: { id },
      data,
      select: { id: true, name: true, description: true },
    });
  }

  /**
   * Soft-deletes a group by setting deleted_at and deleted_by.
   * @param id - The group ID.
   * @param deletedBy - The ID of the user performing the deletion.
   * @param tx - Optional. Prisma transaction client.
   */
  async softDeleteGroup(
    id: string,
    deletedBy: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.group.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: deletedBy },
    });
  }

  // ---- UserGroup ----

  /**
   * Returns all UserGroup records for a given user.
   * @param userId - The ID of the user whose group memberships to retrieve.
   * @param tx - Optional. Prisma transaction client.
   */
  async findUsersGroups(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<UserGroup[]> {
    const client = tx ?? this.prisma;
    return client.userGroup.findMany({ where: { user_id: userId } });
  }

  /**
   * Returns all ADMIN-role UserGroup records for a given user.
   * @param userId - The user ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findUserAdminMemberships(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<UserGroup[]> {
    const client = tx ?? this.prisma;
    return client.userGroup.findMany({
      where: { user_id: userId, role: "ADMIN" as GroupRole },
    });
  }

  /**
   * Returns all non-deleted groups a user belongs to, including group data.
   * @param userId - The user ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findUserGroupsWithGroup(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.UserGroupGetPayload<{ include: { group: true } }>[]> {
    const client = tx ?? this.prisma;
    return client.userGroup.findMany({
      where: { user_id: userId, group: { deleted_at: null } },
      include: { group: true },
    });
  }

  /**
   * Returns UserGroup records (with group data) for a user, filtered to a specific set of group IDs.
   * @param userId - The user ID.
   * @param groupIds - The allowed group IDs.
   * @param tx - Optional. Prisma transaction client.
   */
  async findUserGroupsInGroups(
    userId: string,
    groupIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.UserGroupGetPayload<{ include: { group: true } }>[]> {
    const client = tx ?? this.prisma;
    return client.userGroup.findMany({
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
   * @param tx - Optional. Prisma transaction client.
   */
  async isUserInGroup(
    userId: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const entry = await client.userGroup.findUnique({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    return entry != null;
  }

  /**
   * Returns the UserGroup record for a specific user-group pair, or null if not found.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findUserGroupMembership(
    userId: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<UserGroup | null> {
    const client = tx ?? this.prisma;
    return client.userGroup.findUnique({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  }

  /**
   * Upserts a UserGroup record, creating it if it does not exist.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async upsertUserGroup(
    userId: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.userGroup.upsert({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
      update: {},
      create: { user_id: userId, group_id: groupId },
    });
  }

  /**
   * Updates the role of a UserGroup record.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   * @param role - The new role to assign.
   * @param tx - Optional. Prisma transaction client.
   */
  async updateUserGroupRole(
    userId: string,
    groupId: string,
    role: GroupRole,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.userGroup.update({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
      data: { role },
    });
  }

  /**
   * Deletes a UserGroup record.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async deleteUserGroup(
    userId: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.userGroup.delete({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  }

  /**
   * Returns all members of a group, including user data.
   * @param groupId - The group ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findGroupMembersWithUser(
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.UserGroupGetPayload<{ include: { user: true } }>[]> {
    const client = tx ?? this.prisma;
    return client.userGroup.findMany({
      where: { group_id: groupId },
      include: { user: true },
    });
  }

  // ---- GroupMembershipRequest ----

  /**
   * Finds a membership request by ID.
   * @param id - The request ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findMembershipRequest(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<GroupMembershipRequest | null> {
    const client = tx ?? this.prisma;
    return client.groupMembershipRequest.findUnique({ where: { id } });
  }

  /**
   * Finds the first PENDING membership request for a user in a group.
   * @param userId - The user ID.
   * @param groupId - The group ID.
   * @param tx - Optional. Prisma transaction client.
   */
  async findPendingMembershipRequest(
    userId: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<GroupMembershipRequest | null> {
    const client = tx ?? this.prisma;
    return client.groupMembershipRequest.findFirst({
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
   * @param identity - Identity object of requestor.
   * @param tx - Optional. Prisma transaction client.
   */
  async createMembershipRequest(
    userId: string,
    groupId: string,
    identity: ResolvedIdentity,
    tx?: Prisma.TransactionClient,
  ): Promise<GroupMembershipRequest> {
    const client = tx ?? this.prisma;
    return client.groupMembershipRequest.create({
      data: {
        user_id: userId,
        group_id: groupId,
        status: "PENDING" as $Enums.GroupMembershipRequestStatus,
        created_by: identity.actorId,
        updated_by: identity.actorId,
      },
    });
  }

  /**
   * Updates a membership request with the provided data.
   * @param id - The request ID.
   * @param data - The fields to update.
   * @param tx - Optional. Prisma transaction client.
   */
  async updateMembershipRequest(
    id: string,
    data: Prisma.GroupMembershipRequestUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.groupMembershipRequest.update({ where: { id }, data });
  }

  /**
   * Atomically approves a membership request: upserts the user into the group
   * and updates the request status within a single transaction.
   * @param requestUserId - The user ID from the request.
   * @param requestGroupId - The group ID from the request.
   * @param requestId - The membership request ID.
   * @param resolutionData - The update payload for the request record.
   * @param tx - Optional. Prisma transaction client.
   */
  async approveRequestTransaction(
    requestUserId: string,
    requestGroupId: string,
    requestId: string,
    resolutionData: Prisma.GroupMembershipRequestUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (tx) {
      await tx.userGroup.upsert({
        where: {
          user_id_group_id: {
            user_id: requestUserId,
            group_id: requestGroupId,
          },
        },
        update: {},
        create: { user_id: requestUserId, group_id: requestGroupId },
      });
      await tx.groupMembershipRequest.update({
        where: { id: requestId },
        data: resolutionData,
      });
      return;
    }
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
   * @param tx - Optional. Prisma transaction client.
   */
  async findGroupMembershipRequests(
    groupId: string,
    status?: $Enums.GroupMembershipRequestStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<
    Prisma.GroupMembershipRequestGetPayload<{ include: { user: true } }>[]
  > {
    const client = tx ?? this.prisma;
    return client.groupMembershipRequest.findMany({
      where: { group_id: groupId, ...(status !== undefined ? { status } : {}) },
      include: { user: true },
    });
  }

  /**
   * Returns all membership requests made by a user, optionally filtered by status.
   * Includes the group name.
   * @param userId - The user ID.
   * @param status - Optional status filter.
   * @param tx - Optional. Prisma transaction client.
   */
  async findUserMembershipRequests(
    userId: string,
    status?: $Enums.GroupMembershipRequestStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<
    Prisma.GroupMembershipRequestGetPayload<{
      include: { group: { select: { name: true } } };
    }>[]
  > {
    const client = tx ?? this.prisma;
    return client.groupMembershipRequest.findMany({
      where: { user_id: userId, ...(status !== undefined ? { status } : {}) },
      include: { group: { select: { name: true } } },
    });
  }
}
