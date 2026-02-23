import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class GroupService {
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
}
