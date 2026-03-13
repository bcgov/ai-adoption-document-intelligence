import {
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { DatabaseService } from "../database/database.service";
import { GroupService } from "../group/group.service";
import { AppLoggerService } from "../logging/app-logger.service";
import {
  THROTTLE_AUTH_LIMIT,
  THROTTLE_AUTH_REFRESH_LIMIT,
  THROTTLE_AUTH_REFRESH_TTL_MS,
  THROTTLE_AUTH_TTL_MS,
} from "./auth.config";
import { AuthService } from "./auth.service";
import {
  AUTH_COOKIE_NAMES,
  COOKIE_OPTIONS,
  clearAuthCookies,
  generateCsrfToken,
  PkceCookieData,
  setAuthCookies,
} from "./cookie-auth.utils";
import { MeResponseDto, OAuthCallbackQueryDto, RefreshReturnDto } from "./dto";
import { Public } from "./public.decorator";
import { User } from "./types";

/**
 * Thin HTTP layer that exposes the OAuth entrypoints to the frontend.
 * Auth flow routes are public; the /me endpoint requires authentication.
 * Tokens are stored in HttpOnly cookies — the frontend never handles raw tokens.
 */
@ApiTags("Authorization")
@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly groupService: GroupService,
    private readonly databaseService: DatabaseService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Refreshes provider tokens using the refresh_token HttpOnly cookie.
   * Sets new auth cookies and returns { expires_in } for frontend timer scheduling.
   */
  @Public()
  @Post("refresh")
  @Throttle({
    default: {
      ttl: THROTTLE_AUTH_REFRESH_TTL_MS,
      limit: THROTTLE_AUTH_REFRESH_LIMIT,
    },
  })
  @ApiOperation({
    summary: "Refresh provider tokens using the refresh_token cookie",
  })
  @ApiOkResponse({
    type: RefreshReturnDto,
    description: "Returns expires_in and sets new auth cookies",
  })
  @ApiBadRequestResponse({ description: "Failed to refresh access token" })
  @ApiUnauthorizedResponse({ description: "No refresh token cookie present" })
  @ApiTooManyRequestsResponse({
    description: `Rate limit exceeded — max ${THROTTLE_AUTH_REFRESH_LIMIT} requests per window`,
  })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshReturnDto> {
    const refreshTokenValue = req.cookies?.[AUTH_COOKIE_NAMES.REFRESH_TOKEN];
    if (!refreshTokenValue) {
      throw new UnauthorizedException("No refresh token available");
    }

    const tokens = await this.authService.refreshAccessToken(refreshTokenValue);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, tokens, csrfToken);

    return { expires_in: tokens.expires_in };
  }

  /**
   * Redirects the browser to the Keycloak authorization endpoint.
   * Sets the PKCE verifier + state + nonce in an HttpOnly cookie for the callback to read.
   */
  @Public()
  @Get("login")
  @Throttle({
    default: { ttl: THROTTLE_AUTH_TTL_MS, limit: THROTTLE_AUTH_LIMIT },
  })
  @ApiOperation({ summary: "Redirect to Keycloak authorization endpoint" })
  @ApiResponse({
    status: 302,
    description: "Redirects to the Keycloak authorization endpoint",
    headers: {
      Location: {
        description: "URL to redirect the client to",
        schema: { type: "string" },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: "Failed to generate login URL",
  })
  @ApiTooManyRequestsResponse({
    description: `Rate limit exceeded — max ${THROTTLE_AUTH_LIMIT} requests per window`,
  })
  async getLoginUrl(@Res() res: Response) {
    try {
      const { url, state, codeVerifier, nonce } =
        await this.authService.getLoginUrl();

      // Store PKCE data in an HttpOnly cookie scoped to the callback path
      const pkceData: PkceCookieData = { state, codeVerifier, nonce };
      res.cookie(
        AUTH_COOKIE_NAMES.PKCE_VERIFIER,
        JSON.stringify(pkceData),
        COOKIE_OPTIONS.pkceVerifier(),
      );

      res.redirect(url);
    } catch {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: "Failed to generate login URL" });
    }
  }

  /**
   * Drives the browser through the Keycloak logout endpoint.
   * Reads id_token from HttpOnly cookie to pass as id_token_hint, then clears all auth cookies.
   */
  @Public()
  @Get("logout")
  @Throttle({
    default: { ttl: THROTTLE_AUTH_TTL_MS, limit: THROTTLE_AUTH_LIMIT },
  })
  @ApiOperation({
    summary: "Clear auth cookies and redirect to Keycloak logout",
  })
  @ApiResponse({
    status: 302,
    description:
      "Clears auth cookies and redirects to the Keycloak logout endpoint",
    headers: {
      Location: {
        description: "URL to redirect the client to",
        schema: { type: "string" },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: "Failed to generate logout URL",
  })
  @ApiTooManyRequestsResponse({
    description: `Rate limit exceeded — max ${THROTTLE_AUTH_LIMIT} requests per window`,
  })
  async logout(@Req() req: Request, @Res() res: Response) {
    try {
      const idTokenHint = req.cookies?.[AUTH_COOKIE_NAMES.ID_TOKEN] as
        | string
        | undefined;
      clearAuthCookies(res);
      const logoutUrl = this.authService.getLogoutUrl(idTokenHint);
      res.redirect(logoutUrl);
    } catch {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: "Failed to generate logout URL" });
    }
  }

  /**
   * Receives the redirect from Keycloak after the user authenticates.
   * Reads PKCE data from the HttpOnly cookie, exchanges the authorization code for tokens,
   * sets auth cookies, and redirects the browser to the SPA with a clean URL.
   */
  @Public()
  @Get("callback")
  @Throttle({
    default: { ttl: THROTTLE_AUTH_TTL_MS, limit: THROTTLE_AUTH_LIMIT },
  })
  @ApiOperation({
    summary:
      "Handle Keycloak OAuth callback, set auth cookies, and redirect to application",
  })
  @ApiResponse({
    status: 302,
    description: "Sets auth cookies and redirects to the application",
    headers: {
      Location: {
        description: "URL to redirect the client to",
        schema: { type: "string" },
      },
    },
  })
  async oauthCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Read and validate PKCE cookie
      const pkceCookie = req.cookies?.[AUTH_COOKIE_NAMES.PKCE_VERIFIER];
      if (!pkceCookie) {
        throw new UnauthorizedException("PKCE verifier missing or expired");
      }

      const pkceData: PkceCookieData = JSON.parse(pkceCookie);

      // Clear the PKCE cookie immediately regardless of validation outcome
      res.clearCookie(AUTH_COOKIE_NAMES.PKCE_VERIFIER, {
        path: "/api/auth/callback",
      });

      if (pkceData.state !== query.state) {
        throw new UnauthorizedException("State mismatch — possible CSRF");
      }

      // Exchange code for tokens
      const tokens = await this.authService.handleCallback(
        query.code,
        query.state,
        pkceData.codeVerifier,
        pkceData.nonce,
        query.iss,
      );

      await this.authService.upsertUserFromToken(tokens.claims);

      // Set auth cookies
      const csrfToken = generateCsrfToken();
      setAuthCookies(res, tokens, csrfToken);

      // Redirect to the SPA with a clean URL (no UUID or tokens in query string)
      return res.redirect(this.authService.getFrontendUrl());
    } catch (error) {
      this.logger.error("OAuth callback handling failed:", error);
      const redirectUrl =
        this.authService.buildErrorRedirect("callback_failed");
      return res.redirect(redirectUrl);
    }
  }

  /**
   * Returns the authenticated user's profile information, including group memberships.
   * Requires a valid access_token cookie or Bearer token.
   * The frontend uses this to display user info, schedule token refresh, determine
   * system-admin status, and access available groups with per-group roles.
   * System-admin users receive all groups in the system.
   */
  @Get("me")
  @ApiOperation({
    summary: "Get current user profile from validated JWT",
    description:
      "Returns the user's profile, token expiry, system-admin status, and group memberships with per-group roles. System-admins receive all groups.",
  })
  @ApiOkResponse({
    type: MeResponseDto,
    description:
      "Returns current user profile, token expiry, admin status, and groups with roles",
  })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiForbiddenResponse({ description: "Invalid token" })
  async getMe(@Req() req: Request): Promise<MeResponseDto> {
    const user = req.user as User;
    const now = Math.floor(Date.now() / 1000);
    const exp = (user.exp as number) || now;
    const userId = req.resolvedIdentity?.userId ?? "";

    const isAdmin = await this.databaseService.isUserSystemAdmin(userId);
    const groups = await this.groupService.getUserGroups(userId, userId);

    return {
      sub: userId,
      name: (user.name as string) || (user.display_name as string),
      preferred_username:
        (user.preferred_username as string) || (user.idir_username as string),
      email: user.email,
      isAdmin,
      expires_in: Math.max(exp - now, 0),
      groups,
    };
  }
}
