import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { $Enums } from "@generated/client";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class GroupService {
  constructor(private readonly databaseService: DatabaseService) {}
  /**
   * Deletes an existing group by ID.
   */
  async deleteGroup(groupId: string): Promise<void> {
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    await this.databaseService.prisma.group.delete({ where: { id: groupId } });
  }

  /**
   * Returns all existing groups.
   */
  async getAllGroups(): Promise<Array<{ id: string; name: string }>> {
    return await this.databaseService.prisma.group.findMany({
      select: { id: true, name: true },
    });
  }

  /**
   * Returns all groups a user is a member of.
   */
  async getUserGroups(
    userId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const userGroups = await this.databaseService.prisma.userGroup.findMany({
      where: { user_id: userId },
      include: { group: true },
    });
    return userGroups.map((ug) => ({ id: ug.group.id, name: ug.group.name }));
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
      return;
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
      return;
    }

    await this.databaseService.prisma.groupMembershipRequest.create({
      data: {
        user_id: userId,
        group_id: groupId,
        status: $Enums.GroupMembershipRequestStatus.PENDING,
        created_by: userId,
        updated_by: userId,
      },
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
  }

  /**
   * Approves a pending group membership request, atomically adding the user
   * to the group and updating the request status within a single transaction.
   * - Throws NotFoundException if the request does not exist.
   * - Throws BadRequestException if the request is not in PENDING state.
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
  }

  /**
   * Denies a pending group membership request without adding the user to the group.
   * - Throws NotFoundException if the request does not exist.
   * - Throws BadRequestException if the request is not in PENDING state.
   * @param adminId - The ID of the denying admin (from JWT sub claim).
   * @param requestId - The ID of the membership request to deny.
   * @param reason - Optional reason for denial.
   */
  async denyMembershipRequest(
    adminId: string,
    requestId: string,
    reason?: string,
  ): Promise<void> {
    await this.getValidPendingRequest(requestId, "denied");
    await this.databaseService.prisma.groupMembershipRequest.update({
      where: { id: requestId },
      data: this.buildResolutionData(
        adminId,
        $Enums.GroupMembershipRequestStatus.DENIED,
        reason,
      ),
    });
  }

  /**
   * Fetches a membership request by ID and validates it is in PENDING state.
   * @param requestId - The ID of the membership request.
   * @param action - Verb describing the intended action (e.g. "approved"), used in error messages.
   * @throws NotFoundException if the request does not exist.
   * @throws BadRequestException if the request is not in PENDING state.
   */
  private async getValidPendingRequest(
    requestId: string,
    action: string,
  ) {
    const request =
      await this.databaseService.prisma.groupMembershipRequest.findUnique({
        where: { id: requestId },
      });
    if (!request) {
      throw new NotFoundException("Membership request not found");
    }
    if (request.status !== $Enums.GroupMembershipRequestStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING requests can be ${action}`,
      );
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
   * Throws an error if a group with the same name already exists.
   */
  async createGroup(name: string): Promise<{ id: string; name: string }> {
    // Check for duplicate group name
    const existing = await this.databaseService.prisma.group.findUnique({
      where: { name },
    });
    if (existing) {
      throw new NotFoundException("Group with this name already exists");
    }
    // Create the group
    const group = await this.databaseService.prisma.group.create({
      data: { name },
    });
    return group;
  }

  async assignUserToGroups(userId: string, groupIds: string[]): Promise<void> {
    // Validate all groups exist
    const groups = await this.databaseService.prisma.group.findMany({
      where: { id: { in: groupIds } },
    });
    if (groups.length !== groupIds.length) {
      throw new NotFoundException("One or more groups not found");
    }

    // Upsert user-group mappings
    await Promise.all(
      groupIds.map(async (groupId) => {
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
      }),
    );
  }
  /**
   * Removes a user from a group by userId and groupId.
   * Throws an error if the group or user does not exist, or if the user is not a member.
   */
  async removeUserFromGroup(groupId: string, userId: string): Promise<void> {
    // Check if group exists
    const group = await this.databaseService.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    // Check if user-group relation exists
    const userGroup = await this.databaseService.prisma.userGroup.findUnique({
      where: {
        user_id_group_id: {
          user_id: userId,
          group_id: groupId,
        },
      },
    });
    if (!userGroup) {
      throw new NotFoundException("User not a member of this group");
    }
    // Remove the user from the group
    await this.databaseService.prisma.userGroup.delete({
      where: {
        user_id_group_id: {
          user_id: userId,
          group_id: groupId,
        },
      },
    });
  }
}
