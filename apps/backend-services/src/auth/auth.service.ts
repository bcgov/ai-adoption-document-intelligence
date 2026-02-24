import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as client from "openid-client";
import { URL } from "url";
import { TokenResponseDto } from "@/auth/dto/token-response.dto";
import { PrismaService } from "../database/prisma.service";

/**
 * Result returned by getLoginUrl(), containing the Keycloak authorization URL
 * and PKCE data that the controller stores in an HttpOnly cookie.
 */
export interface LoginUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}

/**
 * Central orchestrator for the OAuth Authorization Code flow using openid-client.
 * Responsible for OIDC discovery, constructing auth URLs with PKCE, handling callbacks,
 * verifying ID tokens, and proxying refresh operations.
 *
 * This service is stateless — PKCE state is stored in HttpOnly cookies on the browser,
 * and tokens are set as HttpOnly cookies by the controller.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private config: client.Configuration;
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly frontendUrl: string;

  constructor(
    private configService: ConfigService,
    private prismaService: PrismaService
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
   * Returns the URL and PKCE data so the controller can store them in an HttpOnly cookie.
   */
  async getLoginUrl(): Promise<LoginUrlResult> {
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const authUrl = client.buildAuthorizationUrl(this.config, {
      redirect_uri: this.redirectUri,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
    });

    return {
      url: authUrl.href,
      state,
      codeVerifier,
      nonce,
    };
  }

  /**
   * Builds the Keycloak logout URL so the browser can end the realm session.
   * Always includes client_id alongside post_logout_redirect_uri so Keycloak
   * can validate the redirect destination even when id_token_hint is absent.
   */
  getLogoutUrl(idTokenHint?: string): string {
    const params = new URLSearchParams();
    params.append("client_id", this.clientId);
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
   * - Validates PKCE using the code_verifier from the cookie
   * - Exchanges the authorization code for tokens
   * - Validates ID token (signature, issuer, audience, nonce)
   * Returns the token response directly — the controller sets cookies.
   */
  async handleCallback(
    code: string,
    state: string,
    codeVerifier: string,
    nonce: string,
    iss?: string,
  ): Promise<TokenResponseDto> {
    try {
      // Build the callback URL for openid-client
      const callbackUrl = new URL(this.redirectUri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      if (iss) {
        callbackUrl.searchParams.set("iss", iss);
      }

      // Exchange code for tokens with PKCE validation
      const tokens = await client.authorizationCodeGrant(
        this.config,
        callbackUrl,
        {
          pkceCodeVerifier: codeVerifier,
          expectedNonce: nonce,
          expectedState: state,
        },
      );

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expires_in: tokens.expires_in || 300,
        token_type: tokens.token_type || "Bearer",
      };
    } catch (error) {
      this.logger.error(
        `OAuth callback failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new HttpException("Authentication failed", HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Refreshes an access token using the provider refresh token.
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
      this.logger.error(
        `Token refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new HttpException("Token refresh failed", HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Returns the frontend URL for redirect after successful callback.
   */
  getFrontendUrl(): string {
    return this.frontendUrl;
  }

  /**
   * Produces a frontend redirect URL that surfaces an authentication failure.
   */
  buildErrorRedirect(error: string): string {
    const url = new URL(this.frontendUrl);
    url.searchParams.set("auth_error", error);
    return url.toString();
  }

  /**
   * Decodes a JWT ID token and returns the payload.
   */
  decodeIdToken(idToken: string): Record<string, any> {
    const [, payload] = idToken.split(".");
    return JSON.parse(Buffer.from(payload, "base64").toString());
  }

  /**
   * Upserts user in DB from token payload.
   */
  async upsertUserFromToken(tokenPayload: Record<string, any>): Promise<void> {
    const email = tokenPayload.email;
    const lastLogin = new Date();
    if (!email) return;
    await this.prismaService.prisma.user.upsert({
      where: { email },
      update: {
        last_login_at: lastLogin,
      },
      create: {
        email,
        last_login_at: lastLogin,
      },
    });
  }
}
