import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { Strategy } from "passport-jwt";
import { cookieOrBearerExtractor } from "./cookie-auth.utils";
import { User } from "./types";

interface KeycloakJwtPayload {
  sub?: string;
  idir_username?: string;
  display_name?: string;
  email?: string;
  roles?: string[];
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  [key: string]: unknown;
}

/**
 * Passport JWT strategy for validating Keycloak bearer tokens.
 * Uses jwks-rsa to automatically fetch and cache Keycloak's public signing keys.
 * Extracts JWT from HttpOnly cookie first, falling back to Authorization header.
 */
@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly clientId: string;

  constructor(configService: ConfigService) {
    const ssoAuthServerUrl = configService.get<string>("SSO_AUTH_SERVER_URL");
    const realm = configService.get<string>("SSO_REALM");
    const clientId = configService.get<string>("SSO_CLIENT_ID");

    if (!ssoAuthServerUrl || !clientId) {
      throw new Error(
        "SSO_AUTH_SERVER_URL and SSO_CLIENT_ID must be configured",
      );
    }

    // Construct JWKS URI based on auth server URL format
    let jwksUri: string;
    let expectedIssuer: string;

    if (ssoAuthServerUrl.includes("/protocol/openid-connect")) {
      // SSO_AUTH_SERVER_URL is the full OIDC endpoint
      expectedIssuer = ssoAuthServerUrl.replace("/protocol/openid-connect", "");
      jwksUri = `${expectedIssuer}/protocol/openid-connect/certs`;
    } else {
      // SSO_AUTH_SERVER_URL is the base Keycloak URL
      if (!realm) {
        throw new Error(
          "SSO_REALM must be configured when using base Keycloak URL",
        );
      }
      expectedIssuer = `${ssoAuthServerUrl}/realms/${realm}`;
      jwksUri = `${expectedIssuer}/protocol/openid-connect/certs`;
    }

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      }),
      jwtFromRequest: cookieOrBearerExtractor,
      issuer: expectedIssuer,
      audience: clientId,
      algorithms: ["RS256"],
    });

    this.clientId = clientId;
  }

  /**
   * Validates the JWT payload and normalizes Keycloak roles.
   * This method is called automatically by Passport after signature verification.
   */
  validate(payload: KeycloakJwtPayload): User {
    const normalizedRoles = this.extractRoles(payload);

    return {
      sub: payload.sub,
      idir_username: payload.idir_username,
      display_name: payload.display_name,
      email: payload.email,
      roles: normalizedRoles,
      ...payload,
    };
  }

  /**
   * Extracts and normalizes roles from Keycloak's various role claim locations.
   * Keycloak can embed roles in multiple JWT claim structures:
   * - roles[] (top-level)
   * - realm_access.roles[] (realm-level roles)
   * - resource_access.<client-id>.roles[] (client-specific roles)
   */
  private extractRoles(payload: KeycloakJwtPayload): string[] {
    const roleSet = new Set<string>();

    const pushRoles = (roles?: string[]) => {
      roles?.forEach((role) => {
        if (role) {
          roleSet.add(role);
        }
      });
    };

    // Collect from all potential sources
    pushRoles(payload.roles);
    pushRoles(payload.realm_access?.roles);

    const resourceRoles = payload.resource_access ?? {};
    Object.values(resourceRoles).forEach((access) => pushRoles(access.roles));
    pushRoles(resourceRoles[this.clientId]?.roles);

    return Array.from(roleSet);
  }
}
