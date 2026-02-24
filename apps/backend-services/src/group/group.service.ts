import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
   * Allows a user to request membership to a group (creates a pending request).
   * NOTE: Implementation assumes a MembershipRequest model exists. If not, this should be clarified.
   */
  async requestMembership(userId: string, groupId: string): Promise<void> {
    // Placeholder: implement actual request logic if MembershipRequest model exists
    // For now, just throw to indicate this needs clarification
    throw new Error(
      "Membership request logic not implemented. Please define MembershipRequest model.",
    );
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
