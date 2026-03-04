import { GroupRole } from "@generated/client";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Represents a group that a user belongs to, including their role within it.
 */
export class UserGroupDto {
  @ApiProperty({ description: "Group unique identifier" })
  id: string;

  @ApiProperty({ description: "Group display name" })
  name: string;

  @ApiProperty({
    description: "The user's role in this group",
    enum: GroupRole,
  })
  role: GroupRole;

  @ApiProperty({
    description: "Optional description of the group",
    required: false,
  })
  description?: string;
}
