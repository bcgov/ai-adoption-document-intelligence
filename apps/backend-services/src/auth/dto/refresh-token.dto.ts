import { ApiProperty } from "@nestjs/swagger";

/**
 * Response from POST /api/auth/refresh.
 * Only exposes expires_in — tokens are set as HttpOnly cookies.
 */
export class RefreshReturnDto {
  @ApiProperty({ description: "Seconds until the new access token expires" })
  expires_in!: number;
}
