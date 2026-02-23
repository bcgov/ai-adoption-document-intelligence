import { Controller, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { GroupService } from './group.service';

@Controller('api/users')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  /**
   * Assign a user to multiple groups
   * POST /api/users/:userId/groups
   */
  @Post(':userId/groups')
  async assignUserToGroups(
    @Param('userId') userId: string,
    @Body('groupIds') groupIds: string[],
  ) {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      throw new HttpException('groupIds must be a non-empty array', HttpStatus.BAD_REQUEST);
    }
    try {
      await this.groupService.assignUserToGroups(userId, groupIds);
      return { success: true };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
