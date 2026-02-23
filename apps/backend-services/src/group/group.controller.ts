import { Controller, Post, Body, Param, HttpException, HttpStatus, Delete } from '@nestjs/common';
import { GroupService } from './group.service';

@Controller('api/users')
export class GroupController {
    /**
     * Create a new group
     * POST /api/users/groups
     */
    @Post('groups')
    async createGroup(
      @Body('name') name: string
    ): Promise<{ id: string; name: string }> {
      if (!name || typeof name !== 'string') {
        throw new HttpException('Group name is required', HttpStatus.BAD_REQUEST);
      }
      try {
        return await this.groupService.createGroup(name);
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
    }
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
  /**
   * Remove a user from a group
   * DELETE /api/users/:groupId/users/:userId
   */
  @Delete(':groupId/users/:userId')
  async removeUserFromGroup(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string
  ): Promise<{ success: boolean }> {
    await this.groupService.removeUserFromGroup(groupId, userId);
    return { success: true };
  }
}
