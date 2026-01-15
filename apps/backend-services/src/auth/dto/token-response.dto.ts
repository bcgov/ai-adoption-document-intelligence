// A copy of TokenResponse Interface from auth.service

import { ApiProperty } from "@nestjs/swagger";

// Needed for OpenAPI return value
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
