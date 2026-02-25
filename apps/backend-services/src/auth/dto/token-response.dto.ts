import { ApiProperty } from "@nestjs/swagger";

/**
 * JWT claims decoded from the Keycloak ID token.
 */
export interface TokenClaims {
  /** Token expiration time (Unix timestamp). */
  exp: number;
  /** Token issued-at time (Unix timestamp). */
  iat: number;
  /** JWT ID – unique identifier for this token. */
  jti: string;
  /** Issuer URL (Keycloak realm). */
  iss: string;
  /** Audience – the client this token is intended for. */
  aud: string;
  /** Subject – the unique user identifier. */
  sub: string;
  /** Token type (e.g. "ID"). */
  typ: string;
  /** Authorized party – the client that requested the token. */
  azp: string;
  /** Nonce used to associate a client session with an ID token. */
  nonce: string;
  /** Session ID within the identity provider. */
  sid: string;
  /** Access-token hash. */
  at_hash: string;
  /** IDIR user GUID (uppercase). */
  idir_user_guid: string;
  /** User principal name (e.g. email from the upstream IdP). */
  user_principal_name: string;
  /** Upstream identity provider name (e.g. "azureidir"). */
  identity_provider: string;
  /** IDIR username (short handle). */
  idir_username: string;
  /** Full display name from the upstream IdP. */
  name: string;
  /** Preferred username (typically sub without the realm suffix). */
  preferred_username: string;
  /** First name. */
  given_name: string;
  /** Display name (may differ from name). */
  display_name: string;
  /** Session state identifier. */
  session_state: string;
  /** Last name / family name. */
  family_name: string;
  /** Email address. */
  email: string;
}

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

  @ApiProperty()
  claims: TokenClaims;
}
