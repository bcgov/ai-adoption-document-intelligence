import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/**
 * DTO for denying a group membership request.
 * The admin's identity is derived from the JWT token, not this body.
 */
export class DenyMembershipRequestDto {
  @ApiPropertyOptional({ description: "Optional reason for denial" })
  @IsOptional()
  @IsString()
  reason?: string;
}
