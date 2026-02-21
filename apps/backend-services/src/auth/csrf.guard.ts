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
 * For state-changing requests (POST, PUT, DELETE, PATCH) that are authenticated
 * via cookies (no explicit Authorization or x-api-key header), the guard verifies
 * that the `X-CSRF-Token` header matches the `csrf_token` cookie value.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed through.
 * Requests using Bearer tokens or API keys are not vulnerable to CSRF and are skipped.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Safe (read-only) methods are never CSRF-vulnerable
    if (CsrfGuard.SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    // Requests with explicit Authorization header (Bearer token) are not CSRF-vulnerable
    const authHeader = request.headers["authorization"];
    if (
      authHeader &&
      typeof authHeader === "string" &&
      authHeader.startsWith("Bearer ")
    ) {
      return true;
    }

    // Requests with API key header are not CSRF-vulnerable
    if (request.headers["x-api-key"]) {
      return true;
    }

    // If no auth cookie is present, this isn't a cookie-authenticated request — skip CSRF
    const accessTokenCookie = request.cookies?.[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
    if (!accessTokenCookie) {
      return true;
    }

    // Cookie-authenticated state-changing request: enforce CSRF double-submit
    const csrfCookie = request.cookies?.[AUTH_COOKIE_NAMES.CSRF_TOKEN];
    const csrfHeader = request.headers[CSRF_HEADER_NAME];

    if (
      !csrfCookie ||
      !csrfHeader ||
      typeof csrfHeader !== "string" ||
      csrfCookie !== csrfHeader
    ) {
      throw new ForbiddenException("CSRF token validation failed");
    }

    return true;
  }
}
