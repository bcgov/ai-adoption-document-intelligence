import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Represents a single group membership request, returned by the GET /api/groups/:groupId/requests endpoint.
 */
export class GroupMembershipRequestDto {
  @ApiProperty({ description: "The unique identifier of the request" })
  id: string;

  @ApiProperty({ description: "The ID of the user who made the request" })
  userId: string;

  @ApiProperty({ description: "The ID of the group the request is for" })
  groupId: string;

  @ApiProperty({
    description: "The current status of the request",
    enum: ["PENDING", "APPROVED", "DENIED", "CANCELLED"],
  })
  status: string;

  @ApiPropertyOptional({
    description: "The ID of the admin who acted on the request",
  })
  actorId?: string;

  @ApiPropertyOptional({
    description: "The reason provided when acting on the request",
  })
  reason?: string;

  @ApiPropertyOptional({ description: "The date the request was resolved" })
  resolvedAt?: Date;

  @ApiProperty({ description: "The date the request was created" })
  createdAt: Date;
}
