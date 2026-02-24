import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request } from "express";
import { AUTH_COOKIE_NAMES, CSRF_HEADER_NAME } from "./cookie-auth.utils";

/**
 * Global guard implementing the double-submit cookie CSRF pattern.
 *
 * Registered as the LAST APP_GUARD (after JwtAuthGuard, ApiKeyAuthGuard, RolesGuard)
 * so that by the time it runs, authentication has already been resolved.
 *
 * CSRF (Cross-Site Request Forgery) is only a threat for cookie-authenticated requests
 * because the browser automatically attaches cookies to cross-origin requests.
 * Bearer tokens and API keys are explicitly added by client code, so a malicious
 * page cannot forge those — CSRF protection is not needed for them.
 *
 * Decision tree:
 *  1. Safe method (GET/HEAD/OPTIONS)? → allow (read-only, no side effects)
 *  2. Bearer Authorization header?    → allow (not cookie-based, not CSRF-vulnerable)
 *  3. x-api-key header?               → allow (not cookie-based, not CSRF-vulnerable)
 *  4. No access_token cookie?          → allow (no cookie auth = no CSRF risk)
 *  5. Otherwise: cookie-auth + state-changing → require X-CSRF-Token header === csrf_token cookie
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // 1. Safe (read-only) methods cannot cause side effects — no CSRF risk.
    if (CsrfGuard.SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    // 2. Bearer token was explicitly set by client-side code (fetch/XHR).
    //    A cross-origin attacker cannot set this header, so CSRF doesn't apply.
    const authHeader = request.headers["authorization"];
    if (
      authHeader &&
      typeof authHeader === "string" &&
      authHeader.startsWith("Bearer ")
    ) {
      return true;
    }

    // 3. API key is also explicitly attached — same reasoning as Bearer.
    if (request.headers["x-api-key"]) {
      return true;
    }

    // 4. No access_token cookie means the request reached here without cookie auth.
    //    Since CsrfGuard is the LAST guard, the only way to get here without a cookie
    //    is if JwtAuthGuard already allowed the request — i.e. the route is @Public()
    //    (or was authenticated via Bearer/API-key, but those are caught above).
    //    No cookie auth = nothing for an attacker to exploit via CSRF.
    const accessTokenCookie = request.cookies?.[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
    if (!accessTokenCookie) {
      return true;
    }

    // 5. This is a cookie-authenticated, state-changing request — enforce CSRF.
    //    The frontend must read the csrf_token cookie (non-HttpOnly) and echo
    //    its value in the X-CSRF-Token header. A cross-origin attacker can
    //    trigger the browser to SEND the cookie, but cannot READ it due to
    //    SameSite=strict + same-origin policy, so they cannot set the header.
    const csrfCookie = request.cookies?.[AUTH_COOKIE_NAMES.CSRF_TOKEN];
    const csrfHeader = request.headers[CSRF_HEADER_NAME];

    if (
      !csrfCookie ||
      !csrfHeader ||
      // Express types headers as string | string[] | undefined.
      // A duplicate header (sent twice) becomes string[]. We require exactly
      // one string value — reject arrays to avoid comparing string to string[]
      // and to make the security check's intent explicit.
      typeof csrfHeader !== "string" ||
      csrfCookie !== csrfHeader
    ) {
      throw new ForbiddenException("CSRF token validation failed");
    }

    return true;
  }
}
