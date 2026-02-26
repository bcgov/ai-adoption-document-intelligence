import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";

/**
 * Identity resolution guard.
 *
 * Runs after `JwtAuthGuard` and `ApiKeyAuthGuard` have validated the request.
 * Resolves the requestor's identity and attaches a normalised
 * {@link ResolvedIdentity} object to `request.resolvedIdentity` for
 * consumption by downstream service-layer authorization helpers.
 *
 * Exactly one of `userId` or `groupId` is set per authenticated request:
 * - **JWT path**: `resolvedIdentity.userId` is extracted from `request.user.sub`.
 *   Group membership must be looked up by the service layer.
 * - **API key path**: `resolvedIdentity.groupId` is taken from
 *   `request.apiKeyGroupId` (set by `ApiKeyAuthGuard`). The key is
 *   group-scoped so no user lookup is needed.
 *
 * Always returns `true`; this guard never blocks requests on its own.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  /**
   * Resolves and attaches the requestor's identity to the request context.
   *
   * @param context - The NestJS execution context for the current request.
   * @returns Always `true`; this guard never blocks requests.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.apiKeyGroupId) {
      // API key authentication path: the key is group-scoped, so groupId is
      // the only identity we need. No user lookup required.
      request.resolvedIdentity = { groupId: request.apiKeyGroupId };
    } else if (request.user?.sub) {
      // JWT authentication path: resolve userId from the Passport-validated
      // user object. Group membership is determined by the service layer.
      //
      // TODO §9 — system-admin bypass: Once the roles & claims system is
      // implemented, check for the `system-admin` role here and annotate
      // `resolvedIdentity` accordingly so downstream helpers can skip the DB
      // membership check.
      request.resolvedIdentity = { userId: request.user.sub };
    }
    // else: public route or unauthenticated request — skip identity resolution.

    return true;
  }
}
