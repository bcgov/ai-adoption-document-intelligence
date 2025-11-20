# Auth Module Overview

This folder contains the NestJS pieces that implement the confidential OAuth 2.0 Authorization Code flow against Keycloak. The backend acts as the confidential client and handles all exchanges with the identity provider; the frontend only ever receives the provider-issued tokens after the server validates and temporarily stores them.

## Flow Summary

1. `GET /auth/login` creates a signed `state` token + nonce and redirects the browser to Keycloak.
2. Keycloak redirects back to `GET /auth/callback` with `code` and `state`.
3. `AuthService.handleCallback` verifies `state`, exchanges the code for tokens, validates the ID token, and saves the token bundle in `AuthSessionStore`, returning an opaque `resultId`.
4. The controller redirects the browser to the SPA with `?auth_result=resultId`.
5. The SPA immediately calls `GET /auth/result?result=resultId` to retrieve the tokens; the entry is deleted after this call.
6. Refreshes happen via `POST /auth/refresh`, which proxies the refresh token to Keycloak.
7. Protected routes rely on `BCGovAuthGuard` and (optionally) `RolesGuard` to validate bearer tokens and enforce RBAC.

## Key Components

| File | Responsibility |
| --- | --- |
| `auth.service.ts` | Builds Keycloak URLs, exchanges codes, validates ID tokens, and manages one-time auth results. |
| `auth.controller.ts` | Exposes `/auth/login`, `/auth/callback`, `/auth/result`, `/auth/refresh`, and `/auth/logout`. |
| `auth-session.store.ts` | In-memory, short-lived cache used to hand provider tokens to the SPA exactly once. |
| `bcgov-auth.guard.ts` | Validates incoming bearer tokens via JWKS, attaching the decoded user to the request. |
| `roles.guard.ts` | Enforces role metadata from `@Roles` decorators. |

## Configuration Flags

- `SSO_*` variables configure the Keycloak realm, client id/secret, and redirect URIs.
- `FRONTEND_URL` is used for redirecting the browser back to the SPA after login/logout.
- `AUTH_STATE_SECRET` signs the state JWT; defaults to the client secret.
- `AUTH_RESULT_TTL_SECONDS` controls how long an auth result can be redeemed (default 60).

## Testing Tips

- Ensure the Keycloak client redirect URI points to `/auth/callback` on the backend.
- Watch backend logs during login; failures will emit `callback_failed` redirects.
- Because `AuthSessionStore` is in-memory, a backend restart invalidates in-flight `auth_result` ids.

