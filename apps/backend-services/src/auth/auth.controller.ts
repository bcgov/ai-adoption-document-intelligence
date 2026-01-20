import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { TokenResponseDto } from "@/auth/dto/token-response.dto";
import { AuthService } from "./auth.service";
import {
  AuthResultQueryDto,
  LogoutQueryDto,
  OAuthCallbackQueryDto,
  RefreshReturnDto,
  RefreshTokenDto,
} from "./dto";
import { Public } from "./public.decorator";

/**
 * Thin HTTP layer that exposes the OAuth entrypoints to the frontend.
 * All routes are public because authorization happens via bearer tokens on other controllers.
 */
@ApiTags("Authorization")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  /**
   * Backend endpoint the SPA uses to refresh provider tokens.
   * Delegates to AuthService so only the backend interacts with Keycloak using the client secret.
   */
  @Public()
  @Post("refresh")
  @ApiOperation({ summary: "Refresh provider tokens using a refresh token" })
  @ApiOkResponse({
    type: RefreshReturnDto,
    description: "Returns refreshed token if successful",
  })
  @ApiBadRequestResponse({ example: "Failed to refresh access token" })
  async refreshToken(@Body() body: RefreshTokenDto): Promise<RefreshReturnDto> {
    const tokens = await this.authService.refreshAccessToken(
      body.refresh_token,
    );
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
  @ApiInternalServerErrorResponse({ example: "Failed to generate login URL" })
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
  @ApiOperation({ summary: "Redirect to Keycloak logout endpoint" })
  @ApiResponse({
    status: 302,
    description: "Redirects to the Keycloak logout endpoint",
    headers: {
      Location: {
        description: "URL to redirect the client to",
        schema: { type: "string" },
      },
    },
  })
  @ApiInternalServerErrorResponse({ example: "Failed to generate logout URL" })
  async logout(@Query() query: LogoutQueryDto, @Res() res: Response) {
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
  @ApiOperation({
    summary: "Handle Keycloak OAuth callback and redirect to application",
  })
  @ApiResponse({
    status: 302,
    description: "Redirects to the application with an auth result or error",
    headers: {
      Location: {
        description: "URL to redirect the client to",
        schema: { type: "string" },
      },
    },
  })
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
      this.logger.error("OAuth callback handling failed:", error);
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
  @ApiOperation({
    summary: "Retrieve provider tokens using a resultId after OAuth flow",
  })
  @ApiQuery({ name: "result" })
  @ApiOkResponse({
    description: "Returns the provider tokens for a valid resultId",
    type: TokenResponseDto,
  })
  @ApiNotFoundResponse({
    description: "No stored session was found",
    example: "Auth result expired or invalid",
  })
  async consumeResult(
    @Query() query: AuthResultQueryDto,
  ): Promise<TokenResponseDto> {
    return this.authService.consumeAuthResult(query.result);
  }
}
