import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";
import {
  AuthResultQueryDto,
  LogoutQueryDto,
  OAuthCallbackQueryDto,
  RefreshTokenDto,
} from "./dto";

/**
 * Thin HTTP layer that exposes the OAuth entrypoints to the frontend.
 * All routes are public because authorization happens via bearer tokens on other controllers.
 */
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Backend endpoint the SPA uses to refresh provider tokens.
   * Delegates to AuthService so only the backend interacts with Keycloak using the client secret.
   */
  @Public()
  @Post("refresh")
  async refreshToken(@Body() body: RefreshTokenDto) {
    const tokens = await this.authService.refreshAccessToken(body.refresh_token);
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      expires_in: tokens.expires_in,
    };
  }

  /**
   * Redirects the browser to the Keycloak authorization endpoint.
   * Using a backend redirect keeps client_id/secret pairing server-side (no exposed secrets).
   */
  @Public()
  @Get("login")
  async getLoginUrl(@Res() res: Response) {
    try {
      const loginUrl = this.authService.getLoginUrl();
      res.redirect(loginUrl);
    } catch {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: "Failed to generate login URL" });
    }
  }

  /**
   * Drives the browser through the Keycloak logout endpoint (if an ID token hint is provided).
   * This ensures realm sessions are terminated and the SPA gets a clean slate.
   */
  @Public()
  @Get("logout")
  async logout(
    @Query() query: LogoutQueryDto,
    @Res() res: Response,
  ) {
    try {
      const logoutUrl = this.authService.getLogoutUrl(query.id_token_hint);
      res.redirect(logoutUrl);
    } catch {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: "Failed to generate logout URL" });
    }
  }

  /**
   * Receives the redirect from Keycloak after the user authenticates.
   * Converts the authorization code into tokens and then bounces the browser back to the SPA
   * with an opaque `auth_result` identifier.
   */
  @Public()
  @Get("callback")
  async oauthCallback(
    @Query() query: OAuthCallbackQueryDto,
    @Res() res: Response,
  ) {
    try {
      const resultId = await this.authService.handleCallback(
        query.code,
        query.state,
      );
      const redirectUrl = this.authService.buildAuthResultRedirect(resultId);
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error("OAuth callback handling failed:", error);
      const redirectUrl =
        this.authService.buildErrorRedirect("callback_failed");
      return res.redirect(redirectUrl);
    }
  }

  /**
   * One-time endpoint the SPA calls immediately after redirect to retrieve the provider tokens.
   * The `resultId` is invalidated after the first successful read to keep the flow stateless.
   */
  @Public()
  @Get("result")
  async consumeResult(@Query() query: AuthResultQueryDto) {
    return this.authService.consumeAuthResult(query.result);
  }
}
