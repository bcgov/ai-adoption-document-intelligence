import { ApiProperty } from "@nestjs/swagger";

/**
 * Represents a group entity returned in API responses.
 */
export class GroupDto {
  @ApiProperty({ description: "Group unique identifier" })
  id!: string;

  @ApiProperty({ description: "Group display name" })
  name!: string;

  @ApiProperty({
    description: "Optional description of the group",
    nullable: true,
  })
  description!: string | null;
}
