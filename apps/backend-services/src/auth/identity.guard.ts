import { GroupRole } from "@generated/client";
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { UserService } from "@/actor/user.service";
import { IDENTITY_KEY, IdentityOptions } from "./identity.decorator";
import { ROLE_ORDER } from "./role-order";

export { ROLE_ORDER };

/**
 * Identity resolution guard.
 *
 * Runs after `JwtAuthGuard` and `ApiKeyAuthGuard` have validated the request.
 * Resolves the requestor's identity and attaches a normalised
 * {@link ResolvedIdentity} object to `request.resolvedIdentity` for
 * consumption by downstream service-layer authorization helpers.
 *
 * Populates `resolvedIdentity` on the request:
 * - **JWT path**: When the {@link Identity} decorator is present on the handler,
 *   `resolvedIdentity.userId` is set from `request.user.sub`
 * - **API key path**: When the {@link Identity} decorator is present on the handler,
 *   `resolvedIdentity.isSystemAdmin` is set to `false` and `resolvedIdentity.groupRoles`
 *   is populated using `request.apiKey.groupId` (set by `ApiKeyAuthGuard`) as the key
 *   with a default role of `GroupRole.MEMBER`. When the decorator is absent, a base
 *   identity object is set without enrichment. No database queries are made.
 *
 * Returns `true` when the request is allowed to proceed, or throws:
 * - {@link ForbiddenException} when `requireSystemAdmin: true` is set and the
 *   authenticated identity is not a system admin.
 * - {@link ForbiddenException} when an API-key-authenticated request arrives at
 *   an endpoint where `allowApiKey` is not `true`.
 * - {@link UnauthorizedException} when the endpoint is not public and the request
 *   carries no authenticated identity.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private userService: UserService,
  ) {}

  /**
   * Resolves and attaches the requestor's identity to the request context,
   * then enforces any declarative requirements expressed via {@link IdentityOptions}.
   *
   * @param context - The NestJS execution context for the current request.
   * @returns `true` when the request is permitted to proceed.
   * @throws {ForbiddenException} When `requireSystemAdmin: true` is set and the
   *   authenticated identity is not a system admin (including API-key requests).
   * @throws {ForbiddenException} When an API-key-authenticated request reaches an
   *   endpoint that does not set `allowApiKey: true`.
   * @throws {UnauthorizedException} When the endpoint is not public and no
   *   authenticated identity was found.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const identityOptions = this.reflector.getAllAndOverride<
      IdentityOptions | undefined
    >(IDENTITY_KEY, [context.getHandler(), context.getClass()]);

    if (request.apiKey) {
      if (identityOptions !== undefined) {
        // Reject API key requests unless the endpoint explicitly opts in.
        if (!identityOptions.allowApiKey) {
          throw new ForbiddenException(
            "API key authentication is not allowed for this endpoint",
          );
        }
        const { groupId, actorId } = request.apiKey;
        // @Identity is present and allowApiKey is true: enrich with isSystemAdmin and groupRoles.
        // No database queries required; the key is group-scoped.
        request.resolvedIdentity = {
          isSystemAdmin: false,
          groupRoles: { [groupId]: GroupRole.MEMBER },
          actorId: actorId,
        };
      } else {
        // Api-key was not explicity allowed. It is denied by default.
        throw new ForbiddenException(
          "API key authentication is not allowed for this endpoint",
        );
      }
    } else if (request.user?.sub) {
      const userId = request.user.sub;
      // User guaranteed because they would be added during login process
      const user = (await this.userService.findUserWithGroups(userId))!;

      const groupRoles: Record<string, GroupRole> = {};
      for (const ug of user.userGroups) {
        groupRoles[ug.group_id] = ug.role;
      }

      request.resolvedIdentity = {
        userId,
        isSystemAdmin: user.is_system_admin,
        groupRoles,
        actorId: user.actor_id,
      };
    } else {
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
    // Enforce requireSystemAdmin immediately after enrichment.
    // API keys always have isSystemAdmin = false, so they always fail this check.
    if (
      identityOptions?.requireSystemAdmin &&
      request.resolvedIdentity &&
      !request.resolvedIdentity.isSystemAdmin
    ) {
      throw new ForbiddenException("System admin access required");
    }

    // Enforce groupIdFrom membership check.
    // System admins bypass this check; non-admins must be a member of the resolved group.
    if (identityOptions?.groupIdFrom && request.resolvedIdentity) {
      const { param, query, body } = identityOptions.groupIdFrom;

      if (param || query || body) {
        if (!request.resolvedIdentity.isSystemAdmin) {
          let groupId: string | undefined;

          if (param) {
            const paramsMap = request.params as Record<
              string,
              string | undefined
            >;
            groupId = paramsMap[param];
          } else if (query) {
            const queryVal = request.query[query];
            groupId = typeof queryVal === "string" ? queryVal : undefined;
          } else if (body) {
            const bodyMap = request.body as Record<string, unknown>;
            const bodyVal = bodyMap[body];
            groupId = typeof bodyVal === "string" ? bodyVal : undefined;
          }

          if (!groupId) {
            throw new BadRequestException("Missing required group identifier");
          }

          if (!request.resolvedIdentity.groupRoles?.[groupId]) {
            throw new ForbiddenException(
              "User is not a member of the specified group",
            );
          }

          // Enforce minimumRole if specified. The role is guaranteed to exist
          // at this point because the membership check above has just passed.
          if (identityOptions.minimumRole !== undefined) {
            const userRole = request.resolvedIdentity.groupRoles[groupId];
            if (
              ROLE_ORDER[userRole] < ROLE_ORDER[identityOptions.minimumRole]
            ) {
              throw new ForbiddenException(
                "Insufficient role within the group",
              );
            }
          }
        }
      }
    }

    return true;
  }
}
