import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { API_KEY_AUTH_KEY } from "@/decorators/custom-auth-decorators";
import { IS_PUBLIC_KEY } from "./public.decorator";

/**
 * JWT authentication guard that wraps Passport's JWT strategy.
 *
 * This guard:
 * - Skips validation for routes marked with @Public()
 * - Defers to ApiKeyAuthGuard for routes marked with @ApiKeyAuth() when an API key is present
 * - Validates bearer tokens using the KeycloakJwtStrategy for all other routes
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Check if this endpoint allows API key auth and an API key is provided
    const allowApiKeyAuth = this.reflector.getAllAndOverride<boolean>(
      API_KEY_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyHeader = request.headers["x-api-key"];

    if (allowApiKeyAuth && apiKeyHeader) {
      // Skip bearer token validation - API key guard will handle it
      return true;
    }

    // Delegate to Passport JWT strategy for bearer token validation
    return super.canActivate(context);
  }
}
