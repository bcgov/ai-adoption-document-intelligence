import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { Strategy } from "passport-jwt";
import { cookieOrBearerExtractor } from "./cookie-auth.utils";
import { User } from "./types";

/** Shape of the decoded Keycloak JWT payload. Keycloak includes many claims
 *  beyond the standard OIDC ones; we type the fields we use and allow the
 *  rest via the index signature (they get spread onto req.user). */
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
 * Passport JWT strategy for validating Keycloak-issued JWTs.
 *
 * How it works:
 *  1. passport-jwt extracts the JWT (from cookie or Authorization header).
 *  2. It fetches Keycloak's public signing key via JWKS and verifies the signature.
 *  3. It checks standard claims (issuer, audience, expiry).
 *  4. If all checks pass, it calls our `validate()` method with the decoded payload.
 *  5. `validate()` normalizes the roles and returns a User object, which Passport
 *     attaches to `req.user` for downstream guards and handlers.
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

    // Derive the JWKS URI and expected issuer from the config.
    // We support two SSO_AUTH_SERVER_URL formats:
    //   1. Full OIDC endpoint: "https://sso.example.com/realms/myrealm/protocol/openid-connect"
    //   2. Base Keycloak URL:  "https://sso.example.com" (requires SSO_REALM)
    // The issuer ("iss" claim in the JWT) is always the realm URL, e.g.
    //   "https://sso.example.com/realms/myrealm"
    let jwksUri: string;
    let expectedIssuer: string;

    if (ssoAuthServerUrl.includes("/protocol/openid-connect")) {
      expectedIssuer = ssoAuthServerUrl.replace("/protocol/openid-connect", "");
      jwksUri = `${expectedIssuer}/protocol/openid-connect/certs`;
    } else {
      if (!realm) {
        throw new Error(
          "SSO_REALM must be configured when using base Keycloak URL",
        );
      }
      expectedIssuer = `${ssoAuthServerUrl}/realms/${realm}`;
      jwksUri = `${expectedIssuer}/protocol/openid-connect/certs`;
    }

    // passport-jwt's Strategy constructor takes an options object that controls
    // how JWTs are extracted, verified, and validated — all BEFORE our validate()
    // method is called. If any check fails, Passport rejects with 401.
    super({
      // Instead of a static secret, use JWKS (JSON Web Key Set) to fetch
      // Keycloak's public RSA signing keys on demand. Keys are cached and
      // rate-limited so we don't hit Keycloak on every request. If Keycloak
      // rotates keys, jwks-rsa fetches the new ones automatically.
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      }),
      // Extract JWT from the access_token cookie first, then fall back to the
      // Authorization: Bearer header (for API clients / Swagger).
      jwtFromRequest: cookieOrBearerExtractor,
      // Reject tokens not issued by our Keycloak realm — prevents tokens from
      // other realms or identity providers from being accepted.
      issuer: expectedIssuer,
      // Reject tokens whose "aud" claim doesn't include our client ID — prevents
      // a token issued for a different Keycloak client from being used here.
      audience: clientId,
      // Keycloak signs with RS256 (RSA + SHA-256). Restricting the algorithm
      // prevents algorithm-confusion attacks where an attacker crafts an HS256
      // token signed with the public key as a symmetric secret.
      algorithms: ["RS256"],
    });

    this.clientId = clientId;
  }

  /**
   * Called by Passport AFTER the JWT signature, issuer, audience, and expiry
   * have all been verified. The returned object is attached to `req.user`.
   *
   * We normalize roles here (via extractRoles) so that RolesGuard and
   * downstream handlers can check `req.user.roles` without caring about
   * Keycloak's nested claim structure.
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

  // TODO: review. bcgov may store roles in a different structure,
  // also determine if we need other roles from other sources.
  /**
   * Keycloak doesn't put roles in a single place — depending on how the realm
   * and client are configured, roles can appear in up to three locations:
   *
   *  - `roles[]`                           — top-level claim (if client mappers add it)
   *  - `realm_access.roles[]`              — realm-wide roles (e.g. "admin", "user")
   *  - `resource_access.<clientId>.roles[]` — roles scoped to a specific client
   *
   * extractRoles merges all three into a flat, deduplicated array so the rest
   * of the app (RolesGuard, controllers) can just check `user.roles.includes("admin")`
   * without knowing which Keycloak claim it came from.
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
