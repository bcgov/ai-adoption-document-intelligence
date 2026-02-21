import { randomBytes } from "crypto";
import { CookieOptions, Response } from "express";
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
 */
export const COOKIE_OPTIONS = {
  pkceVerifier: (): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: 2 * 60 * 1000, // 2 minutes
    path: "/api/auth/callback",
  }),

  accessToken: (expiresInSeconds: number): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: expiresInSeconds * 1000,
    path: "/",
  }),

  refreshToken: (): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/api/auth/refresh",
  }),

  idToken: (expiresInSeconds: number): CookieOptions => ({
    ...baseHttpOnlyOptions(),
    maxAge: expiresInSeconds * 1000,
    path: "/api/auth",
  }),

  csrfToken: (): CookieOptions => ({
    httpOnly: false,
    secure: isSecure(),
    sameSite: "strict",
    path: "/",
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
 * Generates a cryptographically random CSRF token.
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
    COOKIE_OPTIONS.csrfToken(),
  );
}

/**
 * Clears all auth cookies on the response (used during logout).
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
  res.clearCookie(AUTH_COOKIE_NAMES.REFRESH_TOKEN, {
    path: "/api/auth/refresh",
  });
  res.clearCookie(AUTH_COOKIE_NAMES.ID_TOKEN, { path: "/api/auth" });
  res.clearCookie(AUTH_COOKIE_NAMES.CSRF_TOKEN, { path: "/" });
}
