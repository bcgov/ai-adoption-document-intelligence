import { ApiProperty } from "@nestjs/swagger";

/**
 * Represents a single member of a group, returned by the GET /api/groups/:groupId/members endpoint.
 */
export class GroupMemberDto {
  @ApiProperty({ description: "The user's unique identifier" })
  userId!: string;

  @ApiProperty({ description: "The user's email address" })
  email!: string;

  @ApiProperty({ description: "The date the user joined the group" })
  joinedAt!: Date;
}
