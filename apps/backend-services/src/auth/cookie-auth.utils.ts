import { randomBytes } from "node:crypto";
import { CookieOptions, Request, Response } from "express";
import { ExtractJwt } from "passport-jwt";
import { TokenResponseDto } from "@/auth/dto/token-response.dto";

/**
 * Cookie names used across the auth flow.
 */
export const AUTH_COOKIE_NAMES = {
  /** Stores PKCE state (code_verifier, nonce, state) during OAuth redirect. */
  PKCE_VERIFIER: "pkce_verifier",
  /** HttpOnly cookie holding the Keycloak access token (JWT). */
  ACCESS_TOKEN: "access_token",
  /** HttpOnly cookie holding the Keycloak refresh token. */
  REFRESH_TOKEN: "refresh_token",
  /** HttpOnly cookie holding the Keycloak ID token (used for logout hint). */
  ID_TOKEN: "id_token",
  /** Non-HttpOnly CSRF token cookie (readable by JS for double-submit pattern). */
  CSRF_TOKEN: "csrf_token",
} as const;

/**
 * Header name the frontend sends the CSRF token in.
 */
export const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Determines if cookies should set the `secure` flag.
 * Only disabled when NODE_ENV is explicitly "development" or "test".
 */
function isSecure(): boolean {
  const env = process.env.NODE_ENV;
  return env !== "development" && env !== "test";
}

/**
 * Base options shared by all HttpOnly auth cookies.
 *
 * - httpOnly: prevents JavaScript from reading token values, mitigating XSS theft.
 * - secure: ensures cookies are only sent over HTTPS in production.
 * - sameSite "lax": allows the cookie on top-level navigations (e.g. user clicks
 *   a link to our app) while still blocking cross-site sub-requests (img, fetch
 *   from another origin). "strict" would break OAuth redirects back to our callback.
 */
function baseHttpOnlyOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax",
  };
}

/**
 * Cookie option presets for each auth cookie.
 *
 * Path scoping is used to restrict which endpoints receive each cookie,
 * following the principle of least privilege. This reduces the attack surface
 * by ensuring tokens are only transmitted to the routes that need them.
 */
export const COOKIE_OPTIONS = {
  /** Scoped to the callback route only — the PKCE verifier is consumed once
   *  when the IdP redirects back. Short TTL limits the window for replay. */
  pkceVerifier: (): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: 2 * 60 * 1000, // 2 minutes
    path: "/api/auth/callback",
  }),

  /** Sent on every request (path "/") so all API endpoints can authenticate.
   *  Lifetime matches the Keycloak token's own expiry. */
  accessToken: (expiresInSeconds: number): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: expiresInSeconds * 1000,
    path: "/",
  }),

  /** Scoped to the refresh endpoint — avoids sending the long-lived refresh
   *  token on every request, limiting exposure if another endpoint is compromised. */
  refreshToken: (): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/api/auth/refresh",
  }),

  /** Scoped to /api/auth — only needed for logout (id_token_hint). */
  idToken: (expiresInSeconds: number): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: expiresInSeconds * 1000,
    path: "/api/auth",
  }),

  /** Non-HttpOnly so the frontend JS can read the value and send it back in
   *  the X-CSRF-Token header (double-submit cookie pattern). sameSite "strict"
   *  (stricter than the auth cookies' "lax") ensures this cookie is never sent
   *  on any cross-site request, even top-level navigations. */
  csrfToken: (expiresInSeconds: number): CookieOptions => ({
    httpOnly: false,
    secure: isSecure(),
    sameSite: "strict",
    path: "/",
    maxAge: expiresInSeconds * 1000,
  }),
} as const;

/**
 * Data stored in the PKCE verifier cookie during the OAuth redirect flow.
 */
export interface PkceCookieData {
  state: string;
  codeVerifier: string;
  nonce: string;
}

/**
 * Generates a cryptographically random CSRF token (256-bit / 64 hex chars).
 * Used in the double-submit cookie pattern: this value is set as a cookie AND
 * must be echoed back by the frontend in the X-CSRF-Token header. An attacker
 * on another origin cannot read our cookies, so they cannot forge the header.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Sets all auth cookies on the response after a successful token exchange or refresh.
 */
export function setAuthCookies(
  res: Response,
  tokens: TokenResponseDto,
  csrfToken: string,
): void {
  const expiresIn = tokens.expires_in || 300;

  res.cookie(
    AUTH_COOKIE_NAMES.ACCESS_TOKEN,
    tokens.access_token,
    COOKIE_OPTIONS.accessToken(expiresIn),
  );

  if (tokens.refresh_token) {
    res.cookie(
      AUTH_COOKIE_NAMES.REFRESH_TOKEN,
      tokens.refresh_token,
      COOKIE_OPTIONS.refreshToken(),
    );
  }

  if (tokens.id_token) {
    res.cookie(
      AUTH_COOKIE_NAMES.ID_TOKEN,
      tokens.id_token,
      COOKIE_OPTIONS.idToken(expiresIn),
    );
  }

  res.cookie(
    AUTH_COOKIE_NAMES.CSRF_TOKEN,
    csrfToken,
    COOKIE_OPTIONS.csrfToken(expiresIn),
  );
}

/**
 * Extracts the raw JWT string from the request.
 * Checks the access_token HttpOnly cookie first, falling back to the
 * Authorization: Bearer header for API clients / Swagger.
 */
export function cookieOrBearerExtractor(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
  if (cookieToken) {
    return cookieToken;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

/**
 * Clears all auth cookies on the response (used during logout).
 * The path option MUST match what was used when setting each cookie,
 * otherwise the browser will not remove it (cookies are path-scoped).
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
  res.clearCookie(AUTH_COOKIE_NAMES.REFRESH_TOKEN, {
    path: "/api/auth/refresh",
  });
  res.clearCookie(AUTH_COOKIE_NAMES.ID_TOKEN, { path: "/api/auth" });
  res.clearCookie(AUTH_COOKIE_NAMES.CSRF_TOKEN, { path: "/" });
}
