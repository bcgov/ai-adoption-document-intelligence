import { Controller, Post, Body, Param, HttpException, HttpStatus, Delete } from '@nestjs/common';
import { GroupService } from './group.service';

@Controller('api/users')
export class GroupController {
      /**
       * Delete an existing group
       * DELETE /api/users/groups/:groupId
       */
      @Delete('groups/:groupId')
      async deleteGroup(@Param('groupId') groupId: string): Promise<{ success: boolean }> {
        await this.groupService.deleteGroup(groupId);
        return { success: true };
      }

      /**
       * Get all existing groups
       * GET /api/users/groups
       */
      @Post('groups/all') // Use GET in real implementation, POST for demo
      async getAllGroups(): Promise<Array<{ id: string; name: string }>> {
        return await this.groupService.getAllGroups();
      }

      /**
       * Get a user's group membership
       * GET /api/users/:userId/groups/membership
       */
      @Post(':userId/groups/membership') // Use GET in real implementation, POST for demo
      async getUserGroups(@Param('userId') userId: string): Promise<Array<{ id: string; name: string }>> {
        return await this.groupService.getUserGroups(userId);
      }

      /**
       * Request membership to a group
       * POST /api/users/:userId/groups/:groupId/request-membership
       */
      @Post(':userId/groups/:groupId/request-membership')
      async requestMembership(
        @Param('userId') userId: string,
        @Param('groupId') groupId: string
      ): Promise<{ success: boolean }> {
        await this.groupService.requestMembership(userId, groupId);
        return { success: true };
      }
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
