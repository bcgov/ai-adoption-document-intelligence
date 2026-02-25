import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/**
 * DTO for cancelling a group membership request.
 * The requesting user's identity is derived from the JWT token, not this body.
 */
export class CancelMembershipRequestDto {
  @ApiPropertyOptional({ description: "Optional reason for cancellation" })
  @IsOptional()
  @IsString()
  reason?: string;
}
