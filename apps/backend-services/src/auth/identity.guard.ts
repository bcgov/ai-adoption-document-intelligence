import { GroupRole } from "@generated/client";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { IDENTITY_KEY, IdentityOptions } from "./identity.decorator";

/**
 * Identity resolution guard.
 *
 * Runs after `JwtAuthGuard` and `ApiKeyAuthGuard` have validated the request.
 * Resolves the requestor's identity and attaches a normalised
 * {@link ResolvedIdentity} object to `request.resolvedIdentity` for
 * consumption by downstream service-layer authorization helpers.
 *
 * Populates `resolvedIdentity` on the request:
 * - **JWT path**: `resolvedIdentity.userId` is extracted from `request.user.sub`.
 *   Group membership must be looked up by the service layer.
 * - **API key path**: When the {@link Identity} decorator is present on the handler,
 *   `resolvedIdentity.isSystemAdmin` is set to `false` and `resolvedIdentity.groupRoles`
 *   is populated using `request.apiKeyGroupId` (set by `ApiKeyAuthGuard`) as the key
 *   with a default role of `GroupRole.MEMBER`. When the decorator is absent, a base
 *   identity object is set without enrichment. No database queries are made.
 *
 * Always returns `true`; this guard never blocks requests on its own.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  /**
   * Resolves and attaches the requestor's identity to the request context.
   *
   * @param context - The NestJS execution context for the current request.
   * @returns Always `true`; this guard never blocks requests.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.apiKeyGroupId) {
      const identityOptions = this.reflector.getAllAndOverride<
        IdentityOptions | undefined
      >(IDENTITY_KEY, [context.getHandler(), context.getClass()]);

      if (identityOptions !== undefined) {
        // @Identity is present: enrich with isSystemAdmin and groupRoles.
        // No database queries required; the key is group-scoped.
        request.resolvedIdentity = {
          isSystemAdmin: false,
          groupRoles: { [request.apiKeyGroupId]: GroupRole.MEMBER },
        };
      } else {
        // @Identity is absent: set base identity without enrichment.
        request.resolvedIdentity = {};
      }
    } else if (request.user?.sub) {
      // JWT authentication path: resolve userId from the Passport-validated
      // user object. Group membership is determined by the service layer.
      request.resolvedIdentity = { userId: request.user.sub };
    }
    // else: public route or unauthenticated request
    // Must explicitly be marked as public though, otherwise throw an auth error
    const isPublic = this.reflector.getAllAndOverride<boolean>("isPublic", [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic && !request.resolvedIdentity) {
      throw new UnauthorizedException(
        "Unauthenticated request to non-public endpoint",
      );
    }

    return true;
  }
}
