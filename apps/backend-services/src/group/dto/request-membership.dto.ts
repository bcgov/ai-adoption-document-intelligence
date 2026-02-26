import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

/**
 * DTO for submitting a group membership request.
 * The requesting user's identity is derived from the JWT token, not this body.
 */
export class RequestMembershipDto {
  @ApiProperty({ description: "The ID of the group to request membership for" })
  @IsString()
  groupId: string;
}
