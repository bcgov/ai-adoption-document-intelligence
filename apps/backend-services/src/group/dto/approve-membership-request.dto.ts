import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/**
 * DTO for approving a group membership request.
 * The admin's identity is derived from the JWT token, not this body.
 */
export class ApproveMembershipRequestDto {
  @ApiPropertyOptional({ description: "Optional reason for approval" })
  @IsOptional()
  @IsString()
  reason?: string;
}
