import { HttpException, HttpStatus, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as client from "openid-client";
import { URL } from "url";
import { TokenResponseDto } from "@/auth/dto/token-response.dto";
import { AuthSessionStore } from "./auth-session.store";

/**
 * Central orchestrator for the OAuth Authorization Code flow using openid-client.
 * Responsible for OIDC discovery, constructing auth URLs with PKCE, handling callbacks,
 * verifying ID tokens, persisting short-lived auth results, and proxying refresh operations.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private config: client.Configuration;
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly frontendUrl: string;

  constructor(
    private configService: ConfigService,
    private authSessionStore: AuthSessionStore,
  ) {
    const authServerUrl = this.configService.get<string>("SSO_AUTH_SERVER_URL");
    const realm = this.configService.get<string>("SSO_REALM");

    if (!authServerUrl || !realm) {
      throw new Error("SSO_AUTH_SERVER_URL and SSO_REALM must be configured");
    }

    // Normalize the issuer URL
    if (authServerUrl.includes("/protocol/openid-connect")) {
      this.issuer = authServerUrl.replace("/protocol/openid-connect", "");
    } else {
      this.issuer = `${authServerUrl}/realms/${realm}`;
    }

    this.clientId = this.configService.get<string>("SSO_CLIENT_ID") || "";
    this.clientSecret =
      this.configService.get<string>("SSO_CLIENT_SECRET") || "";
    this.redirectUri =
      this.configService.get<string>("SSO_REDIRECT_URI") ||
      "http://localhost:3002/api/auth/callback";
    this.frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";

    if (!this.clientId || !this.clientSecret) {
      throw new Error("SSO_CLIENT_ID and SSO_CLIENT_SECRET must be configured");
    }
  }

  /**
   * Performs OIDC discovery on module initialization.
   * Auto-discovers all Keycloak endpoints from .well-known/openid-configuration
   */
  async onModuleInit() {
    try {
      this.config = await client.discovery(
        new URL(this.issuer),
        this.clientId,
        this.clientSecret,
      );
    } catch (error) {
      throw new Error(
        `Failed to discover OIDC endpoints at ${this.issuer}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Builds the authorization URL with PKCE and nonce protection.
   * Stores PKCE state server-side for validation during callback.
   */
  async getLoginUrl(): Promise<string> {
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    // Store PKCE state for callback validation
    this.authSessionStore.savePKCEState(state, codeVerifier, nonce);

    const authUrl = client.buildAuthorizationUrl(this.config, {
      redirect_uri: this.redirectUri,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    return authUrl.href;
  }

  /**
   * Builds the Keycloak logout URL so the browser can end the realm session.
   */
  getLogoutUrl(idTokenHint?: string): string {
    const params = new URLSearchParams();
    params.append(
      "post_logout_redirect_uri",
      this.configService.get<string>("SSO_POST_LOGOUT_REDIRECT_URI") ||
        this.frontendUrl,
    );

    if (idTokenHint) {
      params.append("id_token_hint", idTokenHint);
    }

    // Build logout URL manually since openid-client doesn't have a helper for this
    const logoutEndpoint = `${this.issuer}/protocol/openid-connect/logout`;
    return `${logoutEndpoint}?${params.toString()}`;
  }

  /**
   * Handles the redirect back from Keycloak.
   * - Validates the state and retrieves PKCE parameters
   * - Exchanges the authorization code for tokens using PKCE
   * - Validates ID token (signature, issuer, audience, nonce)
   * - Persists the provider tokens in a short-lived in-memory store
   * Returns the opaque `resultId` that the frontend will redeem once.
   */
  async handleCallback(
    code: string,
    state: string,
    iss?: string,
  ): Promise<string> {
    try {
      // Retrieve and consume PKCE state
      const { codeVerifier, nonce } = this.authSessionStore.consumePKCEState(state);

      // Build the callback URL for openid-client
      // Must include all parameters from the authorization response, especially `iss`
      // when the server advertises authorization_response_iss_parameter_supported
      const callbackUrl = new URL(this.redirectUri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      if (iss) {
        callbackUrl.searchParams.set("iss", iss);
      }

      // Exchange code for tokens with PKCE validation
      // openid-client handles: code exchange, ID token validation, nonce verification
      const tokens = await client.authorizationCodeGrant(
        this.config,
        callbackUrl,
        {
          pkceCodeVerifier: codeVerifier,
          expectedNonce: nonce,
          expectedState: state,
        },
      );

      // Convert openid-client token response to our DTO format
      const tokenResponse: TokenResponseDto = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expires_in: tokens.expires_in || 300,
        token_type: tokens.token_type || "Bearer",
      };

      // Store tokens and return result ID
      return this.authSessionStore.save(tokenResponse);
    } catch (error) {
      throw new HttpException(
        `OAuth callback failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Refreshes an access token using the provider refresh token.
   * Uses openid-client's refresh grant which handles all the details.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponseDto> {
    try {
      const tokens = await client.refreshTokenGrant(this.config, refreshToken);

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expires_in: tokens.expires_in || 300,
        token_type: tokens.token_type || "Bearer",
      };
    } catch (error) {
      throw new HttpException(
        `Failed to refresh access token: ${error instanceof Error ? error.message : "Unknown error"}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Exposes a one-time read for the frontend to retrieve tokens after redirect.
   */
  consumeAuthResult(resultId: string): TokenResponseDto {
    return this.authSessionStore.consume(resultId);
  }

  /**
   * Produces the frontend redirect URL with an `auth_result` query parameter.
   * The frontend will immediately exchange this value for provider tokens.
   */
  buildAuthResultRedirect(resultId: string): string {
    const url = new URL(this.frontendUrl);
    url.searchParams.set("auth_result", resultId);
    return url.toString();
  }

  /**
   * Produces a frontend redirect URL that surfaces an authentication failure.
   */
  buildErrorRedirect(error: string): string {
    const url = new URL(this.frontendUrl);
    url.searchParams.set("auth_error", error);
    return url.toString();
  }
}
