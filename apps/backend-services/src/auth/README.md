# Auth Module Overview

This folder contains the NestJS pieces that implement the confidential OAuth 2.0 Authorization Code flow against Keycloak. The backend acts as the confidential client and handles all exchanges with the identity provider. Tokens are stored in HttpOnly cookies — the frontend never handles raw tokens.

## Flow Summary

1. `GET /api/auth/login` generates PKCE state (code_verifier, nonce, state), stores it in an HttpOnly cookie, and redirects the browser to Keycloak.
2. Keycloak redirects back to `GET /api/auth/callback` with `code` and `state`.
3. `AuthService.handleCallback` reads PKCE data from the cookie, validates state, exchanges the code for tokens, and validates the ID token.
4. The controller sets `access_token`, `refresh_token`, `id_token` as HttpOnly cookies and a `csrf_token` as a readable cookie, then redirects the browser to the SPA with a clean URL.
5. The SPA calls `GET /api/auth/me` to retrieve user profile info and token expiry — this endpoint reads the access_token cookie automatically.
6. Refreshes happen via `POST /api/auth/refresh`, which reads the refresh_token from its HttpOnly cookie and proxies it to Keycloak.
7. Protected routes rely on `JwtAuthGuard` (Passport JWT) and (optionally) `RolesGuard` to validate tokens and enforce RBAC. Tokens are extracted from the HttpOnly cookie first, falling back to the `Authorization: Bearer` header. After JWT signature validation, `TokenIntrospectionService` checks token revocation against Keycloak's introspection endpoint (cached 5 minutes).
8. State-changing requests (POST/PUT/DELETE) from cookie-authenticated clients are protected by `CsrfGuard` using the double-submit cookie pattern.
9. API key validation via `ApiKeyAuthGuard` includes failed-attempt throttling: after 20 failed attempts per IP within 60 seconds, requests are blocked with `429 Too Many Requests`.

## Key Components

| File | Responsibility |
| --- | --- |
| `auth.service.ts` | Builds Keycloak URLs, generates PKCE, exchanges codes, validates ID tokens, and proxies refresh grants. Stateless. |
| `auth.controller.ts` | Exposes `/api/auth/login`, `/api/auth/callback`, `/api/auth/refresh`, `/api/auth/logout`, and `/api/auth/me`. |
| `cookie-auth.utils.ts` | Centralizes cookie names, options, and helper functions for setting/clearing auth cookies. |
| `csrf.guard.ts` | Global guard implementing double-submit cookie CSRF protection for state-changing requests. |
| `keycloak-jwt.strategy.ts` | Passport JWT strategy that extracts tokens from cookies (primary) or Bearer header (fallback). |
| `jwt-auth.guard.ts` | Wraps Passport JWT strategy; skips `@Public()` routes and defers to API key guard when appropriate. After JWT validation, checks token revocation via `TokenIntrospectionService`. |
| `token-introspection.service.ts` | Checks token revocation against Keycloak's introspection endpoint (RFC 7662). Caches results in-memory for 5 minutes per token (keyed by SHA-256 hash). Fails open on errors. |
| `roles.guard.ts` | Enforces role metadata from `@Roles` decorators. |
| `dto/*.ts` | DTOs that validate every auth route payload/query via Nest's ValidationPipe. |

## Configuration Flags

- `SSO_*` variables configure the Keycloak realm, client id/secret, and redirect URIs.
- `FRONTEND_URL` is used for redirecting the browser back to the SPA after login/logout.
- `NODE_ENV` controls whether cookies set the `secure` flag (disabled in `development`/`test`).
