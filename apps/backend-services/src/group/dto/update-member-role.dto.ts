import { GroupRole } from "@generated/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

/**
 * Request body for updating a group member's role.
 */
export class UpdateMemberRoleDto {
  @ApiProperty({
    description: "The new role to assign to the member",
    enum: GroupRole,
    example: GroupRole.EDITOR,
  })
  @IsEnum(GroupRole)
  role!: GroupRole;
}
