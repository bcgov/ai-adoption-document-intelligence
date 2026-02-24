import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { GroupService } from "./group.service";

/**
 * Controller for managing groups and group membership.
 */
@ApiTags("Group")
@Controller("api/groups")
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  /**
   * Delete an existing group
   * DELETE /api/groups/:groupId
   */
  @ApiOperation({ summary: "Delete an existing group" })
  @ApiResponse({ status: 200, description: "Group deleted successfully." })
  @ApiResponse({ status: 404, description: "Group not found." })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Delete(":groupId")
  async deleteGroup(
    @Param("groupId") groupId: string,
  ): Promise<{ success: boolean }> {
    await this.groupService.deleteGroup(groupId);
    return { success: true };
  }

  /**
   * Get all existing groups
   * GET /api/groups
   */
  @ApiOperation({ summary: "Get all existing groups" })
  @ApiResponse({ status: 200, description: "List of groups." })
  @Get()
  async getAllGroups(): Promise<Array<{ id: string; name: string }>> {
    return await this.groupService.getAllGroups();
  }

  /**
   * Get a user's group membership
   * GET /api/groups/user/:userId
   */
  @ApiOperation({ summary: "Get a user's group membership" })
  @ApiResponse({
    status: 200,
    description: "List of groups the user is a member of.",
  })
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @Get("/user/:userId")
  async getUserGroups(
    @Param("userId") userId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return await this.groupService.getUserGroups(userId);
  }

  /**
   * Request membership to a group
   * POST /api/groups/request
   */
  @ApiOperation({ summary: "Request membership to a group" })
  @ApiResponse({
    status: 200,
    description: "Membership requested successfully.",
  })
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @ApiParam({ name: "groupId", description: "Group ID", type: String })
  @Post("/request")
  async requestMembership(
    @Body("userId") userId: string,
    @Body("groupId") groupId: string,
  ): Promise<{ success: boolean }> {
    await this.groupService.requestMembership(userId, groupId);
    return { success: true };
  }

  /**
   * Create a new group
   * POST /api/groups
   */
  @ApiOperation({ summary: "Create a new group" })
  @ApiResponse({ status: 201, description: "Group created successfully." })
  @ApiResponse({ status: 400, description: "Invalid input." })
  @ApiBody({
    schema: {
      properties: { name: { type: "string", description: "Group name" } },
    },
  })
  @Post()
  async createGroup(
    @Body("name") name: string,
  ): Promise<{ id: string; name: string }> {
    if (!name || typeof name !== "string") {
      throw new HttpException("Group name is required", HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.groupService.createGroup(name);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Assign a user to multiple groups
   * POST /api/groups/user/:userId
   */
  @ApiOperation({ summary: "Assign a user to multiple groups" })
  @ApiResponse({
    status: 200,
    description: "User assigned to groups successfully.",
  })
  @ApiResponse({ status: 400, description: "Invalid input." })
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @ApiBody({
    schema: {
      properties: {
        groupIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of group IDs",
        },
      },
    },
  })
  @Post("user/:userId")
  async assignUserToGroups(
    @Param("userId") userId: string,
    @Body("groupIds") groupIds: string[],
  ) {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      throw new HttpException(
        "groupIds must be a non-empty array",
        HttpStatus.BAD_REQUEST,
      );
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
   * DELETE /api/groups/user/:userId?groupId=groupId
   * Note: groupId is passed as a query parameter to allow for multiple group removals without needing to change the endpoint structure.
   */
  @ApiOperation({ summary: "Remove a user from a group" })
  @ApiResponse({
    status: 200,
    description: "User removed from group successfully.",
  })
  @ApiQuery({ name: "groupId", description: "Group ID", type: String })
  @ApiParam({ name: "userId", description: "User ID", type: String })
  @Delete("user/:userId")
  async removeUserFromGroup(
    @Query("groupId") groupId: string,
    @Param("userId") userId: string,
  ): Promise<{ success: boolean }> {
    await this.groupService.removeUserFromGroup(groupId, userId);
    return { success: true };
  }
}
