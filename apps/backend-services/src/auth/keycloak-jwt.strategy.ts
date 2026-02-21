import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { passportJwtSecret } from "jwks-rsa";
import { Request } from "express";
import { User } from "./types";
import { AUTH_COOKIE_NAMES } from "./cookie-auth.utils";

/**
 * Extracts JWT from the access_token HttpOnly cookie first,
 * falling back to the Authorization: Bearer header for backward compatibility
 * (Swagger, external API consumers).
 */
function cookieOrBearerExtractor(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
  if (cookieToken) {
    return cookieToken;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

/**
 * Passport JWT strategy for validating Keycloak bearer tokens.
 * Uses jwks-rsa to automatically fetch and cache Keycloak's public signing keys.
 * Extracts JWT from HttpOnly cookie first, falling back to Authorization header.
 */
@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, "jwt") {
  private readonly clientId: string;

  constructor(private configService: ConfigService) {
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
  validate(payload: any): User {
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
  private extractRoles(
    payload: {
      realm_access?: { roles?: string[] };
      resource_access?: Record<string, { roles?: string[] }>;
      roles?: string[];
    },
  ): string[] {
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
