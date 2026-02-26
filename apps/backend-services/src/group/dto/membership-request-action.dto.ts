import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/**
 * DTO for actions on a group membership request (approve, deny, cancel).
 * The actor's identity is derived from the JWT token, not this body.
 */
export class MembershipRequestActionDto {
  @ApiPropertyOptional({ description: "Optional reason for the action" })
  @IsOptional()
  @IsString()
  reason?: string;
}
