import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Represents a single group membership request belonging to the authenticated caller,
 * returned by the GET /api/groups/requests/mine endpoint.
 */
export class MyMembershipRequestDto {
  @ApiProperty({ description: "The unique identifier of the request" })
  id!: string;

  @ApiProperty({ description: "The ID of the group the request is for" })
  groupId!: string;

  @ApiProperty({ description: "The name of the group the request is for" })
  groupName!: string;

  @ApiProperty({
    description: "The current status of the request",
    enum: ["PENDING", "APPROVED", "DENIED", "CANCELLED"],
  })
  status!: string;

  @ApiPropertyOptional({
    description: "The reason provided when acting on the request",
  })
  reason?: string;

  @ApiProperty({ description: "The date the request was created" })
  createdAt!: Date;
}
