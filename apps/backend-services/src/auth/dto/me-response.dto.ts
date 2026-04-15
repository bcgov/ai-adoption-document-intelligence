import { GroupRole } from "@generated/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * A concise summary of a group, included in the `/me` response so the
 * frontend can determine available groups without an additional API call.
 */
export class GroupSummaryDto {
  @ApiProperty({ description: "Group unique identifier" })
  id!: string;

  @ApiProperty({ description: "Group display name" })
  name!: string;

  @ApiProperty({
    description: "The authenticated user's role in this group",
    enum: GroupRole,
  })
  role!: GroupRole;
}

/**
 * Response from GET /api/auth/me — provides the frontend with
 * user profile data and token expiry info without exposing raw tokens.
 */
export class MeResponseDto {
  @ApiProperty({ description: "Keycloak subject identifier" })
  sub!: string;

  @ApiPropertyOptional({ description: "User display name" })
  name?: string;

  @ApiPropertyOptional({
    description: "Keycloak preferred username or IDIR username",
  })
  preferred_username?: string;

  @ApiPropertyOptional({ description: "User email address" })
  email?: string;

  @ApiProperty({
    description: "Whether the user has system-admin status in the database",
  })
  isAdmin!: boolean;

  @ApiProperty({
    description: "Seconds until the current access token expires",
  })
  expires_in!: number;

  @ApiProperty({
    description:
      "Groups the user belongs to; all groups if the user is a system-admin",
    type: [GroupSummaryDto],
  })
  groups!: GroupSummaryDto[];
}
