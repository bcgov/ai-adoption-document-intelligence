import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosResponse } from "axios";
import { randomBytes } from "crypto";
import { URL } from "url";
import * as jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { AuthSessionStore } from "./auth-session.store";

/**
 * Wire-format returned by Keycloak when exchanging or refreshing tokens.
 * We preserve these fields to keep the frontend stateless and avoid issuing
 * application-specific credentials.
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Central orchestrator for the OAuth Authorization Code flow.
 * Responsible for constructing auth URLs, handling callbacks, verifying ID tokens,
 * persisting short-lived auth results, and proxying refresh operations.
 */
@Injectable()
export class AuthService {
  private readonly tokenEndpoint: string;
  private readonly authEndpoint: string;
  private readonly logoutEndpoint: string;
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly frontendUrl: string;
  private readonly stateSecret: string;
  private readonly jwksClient: JwksClient;

  constructor(
    private configService: ConfigService,
    private authSessionStore: AuthSessionStore,
  ) {
    const authServerUrl = this.configService.get<string>("SSO_AUTH_SERVER_URL");
    const realm = this.configService.get<string>("SSO_REALM");

    if (!authServerUrl || !realm) {
      throw new Error("SSO_AUTH_SERVER_URL and SSO_REALM must be configured");
    }

    let baseUrl: string;
    if (authServerUrl.includes("/protocol/openid-connect")) {
      baseUrl = authServerUrl.replace("/protocol/openid-connect", "");
    } else {
      baseUrl = `${authServerUrl}/realms/${realm}`;
    }

    this.tokenEndpoint = `${baseUrl}/protocol/openid-connect/token`;
    this.authEndpoint = `${baseUrl}/protocol/openid-connect/auth`;
    this.logoutEndpoint = `${baseUrl}/protocol/openid-connect/logout`;
    this.issuer = baseUrl;
    this.clientId = this.configService.get<string>("SSO_CLIENT_ID") || "";
    this.clientSecret =
      this.configService.get<string>("SSO_CLIENT_SECRET") || "";
    this.redirectUri =
      this.configService.get<string>("SSO_REDIRECT_URI") ||
      "http://localhost:3002/auth/callback";
    this.frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";
    this.stateSecret =
      this.configService.get<string>("AUTH_STATE_SECRET") || this.clientSecret;

    if (!this.clientId || !this.clientSecret) {
      throw new Error("SSO_CLIENT_ID and SSO_CLIENT_SECRET must be configured");
    }

    this.jwksClient = new JwksClient({
      jwksUri: `${baseUrl}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxAge: 86400000,
    });
  }

  /**
   * Exchanges an authorization code for provider-issued tokens.
   * This call is made server-to-server and therefore uses the confidential client secret.
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier?: string,
  ): Promise<TokenResponse> {
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("client_id", this.clientId);
      params.append("client_secret", this.clientSecret);
      params.append("code", code);
      params.append("redirect_uri", this.redirectUri);

      if (codeVerifier) {
        params.append("code_verifier", codeVerifier);
      }

      const response: AxiosResponse<TokenResponse> = await axios.post(
        this.tokenEndpoint,
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Token exchange failed:", error);
      throw new HttpException(
        "Failed to exchange authorization code for tokens",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Refreshes an access token using the provider refresh token.
   * The refresh token is never validated client-side; the backend performs this step
   * so we can keep the client secret and refresh permission on the server.
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("client_id", this.clientId);
      params.append("client_secret", this.clientSecret);
      params.append("refresh_token", refreshToken);

      const response: AxiosResponse<TokenResponse> = await axios.post(
        this.tokenEndpoint,
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Token refresh failed:", error);
      throw new HttpException(
        "Failed to refresh access token",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Builds the Keycloak authorization URL with signed state + nonce protection.
   */
  getLoginUrl(): string {
    const { state, nonce } = this.createStateToken();
    const params = new URLSearchParams();
    params.append("client_id", this.clientId);
    params.append("redirect_uri", this.redirectUri);
    params.append("response_type", "code");
    params.append("scope", "openid profile email");
    params.append("state", state);
    params.append("nonce", nonce);

    return `${this.authEndpoint}?${params.toString()}`;
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

    return `${this.logoutEndpoint}?${params.toString()}`;
  }

  /**
   * Handles the redirect back from Keycloak.
   * - Validates the state/nonce token to mitigate CSRF + replay.
   * - Exchanges the code for tokens.
   * - Persists the provider tokens in a short-lived in-memory store.
   * Returns the opaque `resultId` that the frontend will redeem once.
   */
  async handleCallback(code: string, state: string): Promise<string> {
    const { nonce } = this.verifyStateToken(state);
    const tokens = await this.exchangeCodeForTokens(code);

    if (tokens.id_token) {
      await this.validateIdTokenNonce(tokens.id_token, nonce);
    }

    return this.authSessionStore.save(tokens);
  }

  /**
   * Exposes a one-time read for the frontend to retrieve tokens after redirect.
   */
  consumeAuthResult(resultId: string): TokenResponse {
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

  /**
   * Creates a signed JWT which stores the nonce we expect to see in the ID token.
   * We piggyback on JWT so we can leverage expiry, issuer/audience checks, and signature.
   */
  private createStateToken(): { state: string; nonce: string } {
    const nonce = randomBytes(16).toString("hex");
    const payload = { nonce };

    const state = jwt.sign(payload, this.stateSecret, {
      expiresIn: "5m",
      audience: this.clientId,
      issuer: "auth-service",
    });

    return { state, nonce };
  }

  /**
   * Verifies the previously issued state token and returns the embedded nonce.
   */
  private verifyStateToken(state: string): { nonce: string } {
    try {
      const decoded = jwt.verify(state, this.stateSecret, {
        audience: this.clientId,
        issuer: "auth-service",
      }) as { nonce: string };
      return decoded;
    } catch {
      throw new HttpException(
        "Invalid state parameter",
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Ensures the ID token we received was issued for this client and contains the nonce
    we generated before redirecting. This gives defense-in-depth against token replay.
   */
  private async validateIdTokenNonce(
    idToken: string,
    expectedNonce: string,
  ): Promise<void> {
    try {
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || !decoded.header.kid) {
        throw new Error("Invalid ID token");
      }

      const key = await this.jwksClient.getSigningKey(decoded.header.kid);
      const signingKey = key.getPublicKey();

      const verified = jwt.verify(idToken, signingKey, {
        algorithms: ["RS256"],
        issuer: this.issuer,
        audience: this.clientId,
      }) as jwt.JwtPayload;

      if (verified.nonce !== expectedNonce) {
        throw new Error("Nonce mismatch");
      }
    } catch (error) {
      console.error("ID token validation failed:", error);
      throw new HttpException("Invalid ID token", HttpStatus.BAD_REQUEST);
    }
  }
}
