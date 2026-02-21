import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Response from GET /api/auth/me — provides the frontend with
 * user profile data and token expiry info without exposing raw tokens.
 */
export class MeResponseDto {
  @ApiProperty({ description: "Keycloak subject identifier" })
  sub: string;

  @ApiPropertyOptional({ description: "User display name" })
  name?: string;

  @ApiPropertyOptional({ description: "Keycloak preferred username or IDIR username" })
  preferred_username?: string;

  @ApiPropertyOptional({ description: "User email address" })
  email?: string;

  @ApiProperty({ description: "Normalized roles from Keycloak JWT", type: [String] })
  roles: string[];

  @ApiProperty({ description: "Seconds until the current access token expires" })
  expires_in: number;
}
