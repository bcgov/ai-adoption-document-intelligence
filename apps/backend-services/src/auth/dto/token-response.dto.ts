import { ApiProperty } from "@nestjs/swagger";

/**
 * Wire-format returned by Keycloak when exchanging or refreshing tokens.
 * We preserve these fields to keep the frontend stateless and avoid issuing
 * application-specific credentials.
 */
export class TokenResponseDto {
  @ApiProperty()
  access_token: string;

  @ApiProperty()
  refresh_token?: string;

  @ApiProperty()
  id_token?: string;

  @ApiProperty()
  expires_in: number;

  @ApiProperty()
  token_type: string;
}
