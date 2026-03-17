import { GroupRole } from "@generated/client";
import { applyDecorators, SetMetadata } from "@nestjs/common";
import { ApiBearerAuth, ApiSecurity } from "@nestjs/swagger";

/** Metadata key used to store {@link IdentityOptions} on a route handler. */
export const IDENTITY_KEY = "identity";

/**
 * Describes which route parameter, query parameter, or request body field
 * contains the group ID to use for group-scoped authorization checks.
 * Only one field should be set per usage, but this is a convention, not a
 * compile-time constraint.
 */
export interface GroupIdFrom {
  /** Name of the route parameter that holds the group ID (e.g. `"groupId"`). */
  param?: string;
  /** Name of the query string parameter that holds the group ID. */
  query?: string;
  /** Name of the request body field that holds the group ID. */
  body?: string;
}

/**
 * Options accepted by the {@link Identity} decorator to declaratively
 * configure authentication and authorization requirements for a controller
 * method.
 */
export interface IdentityOptions {
  /**
   * When `true`, the guard must confirm the authenticated user holds the
   * system-admin role before proceeding. Defaults to `false`.
   */
  requireSystemAdmin?: boolean;
  /**
   * Specifies where in the request to locate the group ID for group-scoped
   * authorization checks. Leave unset when no group check is needed.
   */
  groupIdFrom?: GroupIdFrom;
  /**
   * The minimum {@link GroupRole} the authenticated identity must hold within
   * the resolved group. Leave unset when no role check is required.
   */
  minimumRole?: GroupRole;
  /**
   * When `true`, API-key-authenticated requests are allowed in addition to
   * JWT-authenticated requests. Defaults to `false`.
   */
  allowApiKey?: boolean;
}

/**
 * Method decorator that attaches {@link IdentityOptions} metadata to a
 * NestJS controller handler so that guards and interceptors can read and
 * enforce the declared requirements.
 *
 * The metadata is stored under the {@link IDENTITY_KEY} key and can be
 * retrieved with `Reflector.get` or `Reflector.getAllAndOverride`.
 *
 * @example
 * ```typescript
 * @Identity({ minimumRole: GroupRole.ADMIN, groupIdFrom: { param: 'groupId' } })
 * @Get(':groupId/resource')
 * getResource() { ... }
 * ```
 *
 * @param options - Authorization requirements for this handler.
 * @returns A NestJS method decorator.
 */
export const Identity = (options?: IdentityOptions) => {
  const decorators: (MethodDecorator | ClassDecorator | PropertyDecorator)[] = [
    SetMetadata(IDENTITY_KEY, options),
    ApiBearerAuth("keycloak-sso"),
  ];

  if (options?.allowApiKey) {
    decorators.push(ApiSecurity("api-key"));
  }

  return applyDecorators(...decorators);
};
