import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class GroupService {
    /**
     * Creates a new group with the given name and optional description.
     * Throws an error if a group with the same name already exists.
     */
    async createGroup(name: string): Promise<{ id: string; name: string }> {
      // Check for duplicate group name
      const existing = await this.databaseService.prisma.group.findUnique({ where: { name } });
      if (existing) {
        throw new NotFoundException('Group with this name already exists');
      }
      // Create the group
      const group = await this.databaseService.prisma.group.create({
        data: { name },
      });
      return group;
    }
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async assignUserToGroups(userId: string, groupIds: string[]): Promise<void> {
    // Validate all groups exist
    const groups = await this.databaseService.prisma.group.findMany({ where: { id: { in: groupIds } } });
    if (groups.length !== groupIds.length) {
      throw new NotFoundException('One or more groups not found');
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
      })
    );
   }
  /**
   * Removes a user from a group by userId and groupId.
   * Throws an error if the group or user does not exist, or if the user is not a member.
   */
  async removeUserFromGroup(groupId: string, userId: string): Promise<void> {
    // Check if group exists
    const group = await this.databaseService.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
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
      throw new NotFoundException('User not a member of this group');
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
