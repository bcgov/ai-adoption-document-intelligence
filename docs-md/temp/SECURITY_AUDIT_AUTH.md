# Authentication & Authorization Security Audit

**Date:** 2026-02-21
**Scope:** Full security review of the OAuth 2.0 / Keycloak authentication implementation, CSRF protection, API key authentication, cookie management, frontend auth context, and supporting infrastructure.
**Files reviewed:** All files under `apps/backend-services/src/auth/`, `apps/backend-services/src/api-key/`, `apps/backend-services/src/decorators/`, `apps/frontend/src/auth/`, `apps/frontend/src/data/services/api.service.ts`, `apps/backend-services/src/main.ts`, nginx configs, and `docs-md/AUTHENTICATION.md`.

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Findings — Critical](#findings--critical)
- [Findings — High](#findings--high)
- [Findings — Medium](#findings--medium)
- [Findings — Low / Informational](#findings--low--informational)
- [Documentation vs. Code Discrepancies](#documentation-vs-code-discrepancies)
- [Positive Security Observations](#positive-security-observations)

---

## Executive Summary

The authentication architecture follows a sound design: confidential OAuth 2.0 Authorization Code Flow with PKCE, HttpOnly cookies, CSRF double-submit pattern, and JWKS-based JWT validation. The core OAuth flow is well-implemented with proper use of `openid-client` for OIDC discovery, PKCE, nonce validation, and token exchange.

However, this audit identified **2 critical**, **4 high**, **6 medium**, and **5 low/informational** findings that should be addressed, ranging from missing rate limiting on authentication endpoints to a duplicate decorator definition that could lead to authorization bypass confusion.

**Remediation Progress:** 2 of 17 findings resolved.

| Finding | Severity | Status |
|---------|----------|--------|
| C-1: No Rate Limiting | Critical | ✅ Resolved |
| C-2: No Security Headers (Helmet) | Critical | ✅ Resolved |
| H-1: CSRF Token No maxAge | High | ⬚ Open |
| H-2: API Key Empty Roles | High | ⬚ Open |
| H-3: Duplicate ApiKeyAuth Decorator | High | ⬚ Open |
| H-4: Auth Error Message Leaks | High | ⬚ Open |
| M-1 through M-6 | Medium | ⬚ Open |
| L-1 through L-5 | Low | ⬚ Open |

---

## Findings — Critical

### C-1: No Rate Limiting on Authentication Endpoints — ✅ RESOLVED

**Location:** [apps/backend-services/src/main.ts](../apps/backend-services/src/main.ts), [apps/backend-services/src/auth/auth.controller.ts](../apps/backend-services/src/auth/auth.controller.ts)

**Status:** Resolved on 2026-02-21.

**Resolution:** Implemented `@nestjs/throttler` (v6.5.0) with:
- **Global default:** 100 requests per minute per IP (configured in `AppModule` via `ThrottlerModule.forRoot()` with `ThrottlerGuard` as global `APP_GUARD`)
- **`POST /api/auth/refresh`:** 5 requests per minute (via `@Throttle()` decorator)
- **`GET /api/auth/login`:** 10 requests per minute (via `@Throttle()` decorator)
- **`GET /api/auth/callback`:** 10 requests per minute (via `@Throttle()` decorator)
- **`GET /api/auth/logout`:** 10 requests per minute (via `@Throttle()` decorator)
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) are included in responses
- Returns HTTP 429 when limits are exceeded
- Tests added in `auth/throttle.spec.ts` (8 tests: decorator metadata validation + integration tests with actual HTTP requests proving 429 behavior)

<details>
<summary>Original finding (pre-resolution)</summary>

**Description:** There is no rate limiting on any endpoint in the application. This is most dangerous for authentication-related endpoints:

- `POST /api/auth/refresh` — can be called rapidly to generate unlimited CSRF tokens and probe for valid refresh tokens
- `GET /api/auth/login` — can trigger unlimited OIDC authorization requests
- `GET /api/auth/callback` — can be probed to brute-force authorization codes (though short-lived)
- API key validation (`X-API-Key` header) involves bcrypt comparison, making it a CPU-exhaustion vector under high request volume

No `@nestjs/throttler`, express-rate-limit, or any other rate-limiting mechanism is present in `package.json` or application code.

**Impact:** Brute-force attacks, credential stuffing, denial-of-service via bcrypt CPU exhaustion on API key validation.

**Recommendation:** Add `@nestjs/throttler` with strict limits on auth endpoints (e.g., 5 requests/minute for `/refresh`, 10/minute for `/login`). Apply a global default rate limit (e.g., 100 requests/minute) and tighter per-route limits on sensitive endpoints.

</details>

---

### C-2: No Security Headers (Helmet) Configured — ✅ RESOLVED

**Location:** [apps/backend-services/src/main.ts](../apps/backend-services/src/main.ts), [apps/frontend/nginx-default.conf](../apps/frontend/nginx-default.conf)

**Status:** Resolved on 2026-02-21.

**Resolution:** Implemented `helmet` (v8.x) middleware in `main.ts` and security headers in nginx:
- **Backend (`helmet` in `main.ts`):** Registered before routes are mounted with the following configuration:
  - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains` (HSTS, 1 year)
  - `X-Frame-Options`: `DENY` (clickjacking prevention)
  - `X-Content-Type-Options`: `nosniff` (MIME type sniffing prevention)
  - `Referrer-Policy`: `strict-origin-when-cross-origin` (limits referrer leakage)
  - `Content-Security-Policy`: `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https://validator.swagger.io` (CSP configured for Swagger UI compatibility)
  - `X-Powered-By`: removed (technology fingerprinting prevention)
- **Frontend (`nginx-default.conf`):** Added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security` headers
- Tests added in `auth/security-headers.spec.ts` (6 tests: verifying each security header is correctly set on responses)

<details>
<summary>Original finding (pre-resolution)</summary>

**Description:** The NestJS application does not use `helmet` or any security header middleware. The following security headers are absent:

- `Strict-Transport-Security` (HSTS) — browsers won't enforce HTTPS-only connections
- `X-Content-Type-Options: nosniff` — MIME type sniffing possible
- `X-Frame-Options: DENY` — clickjacking potential on auth cookies
- `Content-Security-Policy` — no CSP protection
- `X-XSS-Protection` — legacy XSS filter not enabled
- `Referrer-Policy` — referrers may leak auth-related URL parameters

The nginx frontend config also lacks security headers.

**Impact:** Clickjacking attacks could trick users into performing authenticated actions. Missing HSTS allows SSL stripping attacks in non-HSTS-preloaded environments. Missing CSP in the Swagger UI context increases XSS risk.

**Recommendation:** Add `helmet` middleware in `main.ts` before routes are mounted. Add equivalent headers in the nginx config for the frontend.

</details>

---

## Findings — High

### H-1: CSRF Token Not Protected by `maxAge` — Lives Indefinitely as Session Cookie

**Location:** [apps/backend-services/src/auth/cookie-auth.utils.ts](../apps/backend-services/src/auth/cookie-auth.utils.ts#L70-L75)

**Description:** The `csrf_token` cookie has no `maxAge` or `expires` property:

```typescript
csrfToken: (): CookieOptions => ({
  httpOnly: false,
  secure: isSecure(),
  sameSite: "strict",
  path: "/",
}),
```

This makes it a session cookie that persists until the browser is closed. In contrast, the `access_token` cookie has an explicit `maxAge`. This means:

1. If a user closes their browser but the OS preserves the session (common on mobile and some desktop browsers with session restore), the CSRF token persists indefinitely.
2. The CSRF token outlives the access token it was paired with — after refresh, a new CSRF token is set, but the old one was valid for the entire browser session.

**Impact:** Stale CSRF tokens remain usable longer than necessary, increasing the window for token theft via non-HttpOnly cookie access.

**Recommendation:** Set `maxAge` on the CSRF token cookie to match the access token's `expires_in` value, or use a reasonable upper bound (e.g., 24 hours).

---

### H-2: API Key Auth Users Get Empty Roles Array — RBAC Bypass

**Location:** [apps/backend-services/src/auth/api-key-auth.guard.ts](../apps/backend-services/src/auth/api-key-auth.guard.ts#L48-L52)

**Description:** When a request is authenticated via API key, the guard sets:

```typescript
request.user = {
  sub: keyInfo.userId,
  email: keyInfo.userEmail,
  roles: [],  // Always empty
};
```

This means API key-authenticated requests will **always fail** any `@Roles()` check because `roles` is hardcoded to an empty array. While this prevents unintended privilege escalation, it makes `@Roles()` guards silently block all API-key-authenticated requests on endpoints that use both `@ApiKeyAuth()` and `@Roles()`.

More critically, if a developer adds `@ApiKeyAuth()` to an endpoint that has `@Roles()` protection, they may assume API keys provide the required roles. The current behavior would silently deny access, which is safe but confusing. However, if the `@Roles()` guard is ever removed based on the assumption that "API keys are for trusted integrations," all API key requests become fully authorized with no role checks.

**Impact:** Confusing authorization semantics. API key users cannot use role-protected endpoints at all.

**Recommendation:** Either (a) store roles alongside API keys in the database and populate `request.user.roles` from there, or (b) document explicitly that API keys bypass RBAC and are only for specific non-role-protected endpoints.

---

### H-3: Duplicate `API_KEY_AUTH_KEY` and `ApiKeyAuth` Decorator Definitions

**Location:**
- [apps/backend-services/src/auth/api-key-auth.decorator.ts](../apps/backend-services/src/auth/api-key-auth.decorator.ts)
- [apps/backend-services/src/decorators/custom-auth-decorators.ts](../apps/backend-services/src/decorators/custom-auth-decorators.ts)

**Description:** There are two separate definitions of `API_KEY_AUTH_KEY` and `ApiKeyAuth`:

1. `src/auth/api-key-auth.decorator.ts`: Simple `SetMetadata` decorator
2. `src/decorators/custom-auth-decorators.ts`: Composite decorator with Swagger annotations + `SetMetadata`

Both define `API_KEY_AUTH_KEY = "allowApiKeyAuth"`. The guards import from `@/decorators/custom-auth-decorators`, while controllers also use imports from there. The `api-key-auth.decorator.ts` file appears to be dead code — it is not imported anywhere.

**Impact:** Developer confusion. If a developer imports `ApiKeyAuth` from the wrong location (the dead file in `src/auth/`), it would set the same metadata key but lack Swagger documentation, creating inconsistency. The dead file should be removed.

**Recommendation:** Delete `apps/backend-services/src/auth/api-key-auth.decorator.ts` — it is unused and duplicative.

---

### H-4: Error Messages in Auth Service Leak Internal Details

**Location:** [apps/backend-services/src/auth/auth.service.ts](../apps/backend-services/src/auth/auth.service.ts#L168-L174)

**Description:** The auth service propagates internal error messages directly to HTTP responses:

```typescript
throw new HttpException(
  `OAuth callback failed: ${error instanceof Error ? error.message : "Unknown error"}`,
  HttpStatus.BAD_REQUEST,
);
```

And for refresh:
```typescript
throw new HttpException(
  `Failed to refresh access token: ${error instanceof Error ? error.message : "Unknown error"}`,
  HttpStatus.BAD_REQUEST,
);
```

The `error.message` from `openid-client` can include server URLs, token endpoint details, error codes from Keycloak (e.g., `invalid_grant`, `invalid_client`), and other internal information that aids attackers in reconnaissance.

**Impact:** Information disclosure. Attackers learn internal service topology, Keycloak error codes, and can differentiate between error types (expired vs. invalid vs. revoked tokens).

**Recommendation:** Log the full error server-side (`this.logger.error(...)`) but return generic messages to clients: `"Authentication failed"`, `"Token refresh failed"`.

---

## Findings — Medium

### M-1: Refresh Endpoint Marked `@Public()` — CSRF Is the Only Protection

**Location:** [apps/backend-services/src/auth/auth.controller.ts](../apps/backend-services/src/auth/auth.controller.ts#L54-L55)

**Description:** The `POST /api/auth/refresh` endpoint is marked `@Public()`, which means `JwtAuthGuard` is skipped entirely. The only protections are:

1. The refresh token must be present in the HttpOnly cookie (path-scoped to `/api/auth/refresh`)
2. CSRF guard validates the double-submit token

This is architecturally necessary (the access token may be expired when refresh is called), but it means if CSRF protection is ever bypassed (e.g., via a browser bug, misconfigured SameSite policy, or subdomain takeover), an attacker with a victim's refresh token cookie can silently obtain new access tokens.

**Impact:** The refresh endpoint's security depends entirely on CSRF and cookie scoping.

**Recommendation:** This is an acceptable architectural trade-off but should be explicitly documented. Consider adding an additional binding mechanism (e.g., a refresh token rotation counter stored server-side) to detect and revoke stolen refresh tokens.

---

### M-2: CORS Configuration Allows Only Single Origin — No Validation of Dynamic Origins

**Location:** [apps/backend-services/src/main.ts](../apps/backend-services/src/main.ts#L46-L49)

**Description:**

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
});
```

This is appropriately restrictive (single origin with credentials). However, if `FRONTEND_URL` is misconfigured (e.g., set to `*`, or an attacker-controlled domain through environment injection), it would allow cross-origin credentialed requests, completely undermining CSRF protection and cookie security.

**Impact:** Misconfiguration of `FRONTEND_URL` would be a full authentication bypass. Low likelihood but catastrophic impact.

**Recommendation:** Add validation that `FRONTEND_URL` is a well-formed HTTPS URL (in production) before passing it to CORS. Log a warning if it's `*` or an HTTP URL in production.

---

### M-3: Logout Does Not Append `client_id` to Keycloak Logout URL

**Location:** [apps/backend-services/src/auth/auth.service.ts](../apps/backend-services/src/auth/auth.service.ts#L112-L126)

**Description:** The logout URL construction omits `client_id`:

```typescript
getLogoutUrl(idTokenHint?: string): string {
  const params = new URLSearchParams();
  params.append("post_logout_redirect_uri", ...);
  if (idTokenHint) {
    params.append("id_token_hint", idTokenHint);
  }
  const logoutEndpoint = `${this.issuer}/protocol/openid-connect/logout`;
  return `${logoutEndpoint}?${params.toString()}`;
}
```

Per the OIDC RP-Initiated Logout spec and Keycloak's implementation, if `id_token_hint` is not present (e.g., the id_token cookie expired or was cleared), Keycloak requires `client_id` and `post_logout_redirect_uri` together to validate the redirect destination. Without `client_id`, Keycloak may show a confirmation page instead of performing the redirect, or reject the `post_logout_redirect_uri` as unverified.

**Impact:** Logout may not cleanly redirect back to the application when the ID token has expired.

**Recommendation:** Always include `client_id` in the logout URL parameters alongside `post_logout_redirect_uri`.

---

### M-4: PKCE Cookie Contains Sensitive Data as Plain JSON

**Location:** [apps/backend-services/src/auth/auth.controller.ts](../apps/backend-services/src/auth/auth.controller.ts#L101-L106)

**Description:** The PKCE cookie stores `{ state, codeVerifier, nonce }` as plain JSON:

```typescript
res.cookie(
  AUTH_COOKIE_NAMES.PKCE_VERIFIER,
  JSON.stringify(pkceData),
  COOKIE_OPTIONS.pkceVerifier(),
);
```

While the cookie is HttpOnly and has a short TTL (2 minutes), the `codeVerifier` is a security-critical value. If an attacker can read this cookie (e.g., via a man-in-the-middle attack in development mode where `secure: false`), they can complete the OAuth flow on behalf of the user.

**Impact:** The code verifier is the proof key for PKCE. Its exposure defeats the purpose of PKCE.

**Recommendation:** This is mitigated by the HttpOnly flag and 2-minute TTL. However, consider server-side session storage for PKCE state (e.g., a short-lived encrypted server-side cache keyed by the `state` parameter) to eliminate client-side exposure entirely. At minimum, ensure the `secure` flag is always `true` in any non-local environment.

---

### M-5: Cookie `secure` Flag Relies on `NODE_ENV` — Not Guaranteed in All Deployment Environments

**Location:** [apps/backend-services/src/auth/cookie-auth.utils.ts](../apps/backend-services/src/auth/cookie-auth.utils.ts#L30-L34)

**Description:**

```typescript
function isSecure(): boolean {
  const env = process.env.NODE_ENV;
  return env !== "development" && env !== "test";
}
```

If `NODE_ENV` is not set at all (which is common in some container runtimes and CI/CD pipelines), `isSecure()` returns `true`, which is the safe default. However, if a deployment accidentally sets `NODE_ENV=development` in production, all cookies lose their `secure` flag and would be transmitted over plain HTTP.

**Impact:** Accidental exposure of auth cookies over HTTP in misconfigured deployments.

**Recommendation:** Add a startup validation warning: if `NODE_ENV` is `development` or `test` but the application is listening on a non-localhost address, log a security warning. Alternatively, use a dedicated `COOKIES_SECURE=true` environment variable with an explicit override.

---

### M-6: No `@Roles()` Decorators Used Anywhere in the Application

**Location:** Codebase-wide search

**Description:** Despite having a fully implemented `RolesGuard` registered as a global `APP_GUARD`, there are **zero usages** of the `@Roles()` decorator anywhere in the application code. This means the `RolesGuard` always returns `true` for every route because `requiredRoles` is always `undefined`.

**Impact:** RBAC is architecturally present but not enforced. All authenticated users have identical access to all non-public endpoints. The system currently operates as a binary authenticated/unauthenticated model with no role differentiation.

**Recommendation:** Either apply `@Roles()` decorators to endpoints that require specific roles, or document that RBAC is currently unused and the `RolesGuard` is a placeholder for future use. Review whether admin-only endpoints (API key management, template training, etc.) should be role-restricted.

---

## Findings — Low / Informational

### L-1: Nginx Frontend Config Has No Security Headers

**Location:** [apps/frontend/nginx-default.conf](../apps/frontend/nginx-default.conf), [apps/frontend/nginx.conf](../apps/frontend/nginx.conf)

**Description:** The nginx configuration serves the SPA without any security headers. Missing:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy`
- `Referrer-Policy: strict-origin-when-cross-origin`

Since the frontend reads the `csrf_token` cookie and handles authentication redirects, clickjacking protection is important.

**Recommendation:** Add security headers to the nginx `server` block:

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

### L-2: CSRF Token Cookie Uses `sameSite: "strict"` While Auth Cookies Use `sameSite: "lax"`

**Location:** [apps/backend-services/src/auth/cookie-auth.utils.ts](../apps/backend-services/src/auth/cookie-auth.utils.ts)

**Description:** The CSRF token cookie uses `sameSite: "strict"` while auth cookies use `sameSite: "lax"`. This is actually correct and intentional — `lax` on auth cookies allows the OAuth redirect flow (top-level GET navigation from Keycloak), while `strict` on CSRF prevents cross-site sending of the CSRF cookie. However, this means:

- On the very first page load after OAuth callback redirect (a cross-site navigation from Keycloak), the CSRF cookie may not be sent by the browser due to `strict` mode, depending on the browser's interpretation of "cross-site" vs "same-site" for redirect chains.

In practice, the callback handler sets auth cookies and then redirects to the frontend. The frontend then calls `/api/auth/me` (a same-site GET), which works fine. The CSRF token is only needed for state-changing requests, which would be same-site by that point.

**Impact:** Negligible in practice. The CSRF cookie should be available for all subsequent requests after the initial page load.

**Recommendation:** No action required. This is the correct configuration. Document the rationale in the code.

---

### L-3: Token Response DTO (`TokenResponseDto`) Lacks Validation Decorators

**Location:** [apps/backend-services/src/auth/dto/token-response.dto.ts](../apps/backend-services/src/auth/dto/token-response.dto.ts)

**Description:** `TokenResponseDto` has `@ApiProperty()` but no `class-validator` decorators (`@IsString()`, `@IsNumber()`, etc.). Since this DTO represents the response from Keycloak (not user input), validation decorators aren't strictly required — but if this DTO is ever used as an input DTO or if `openid-client` returns unexpected data, there's no validation layer.

**Impact:** Very low. This is an internal DTO, not exposed as an API input.

**Recommendation:** Add basic validation decorators for defense-in-depth, or add a comment clarifying this is an internal DTO.

---

### L-4: `LogoutQueryDto` Is Defined but Never Used

**Location:** [apps/backend-services/src/auth/dto/logout-query.dto.ts](../apps/backend-services/src/auth/dto/logout-query.dto.ts)

**Description:** `LogoutQueryDto` is defined with an `@IsJWT()` validator for `id_token_hint`, but the logout controller endpoint reads `id_token_hint` from cookies, not query parameters. This DTO is exported from the barrel file but never used in any controller.

**Impact:** Dead code. No security impact.

**Recommendation:** Remove `LogoutQueryDto` to reduce confusion.

---

### L-5: API Key Controller Falls Back to `"unknown@example.com"` for Missing Email

**Location:** [apps/backend-services/src/api-key/api-key.controller.ts](../apps/backend-services/src/api-key/api-key.controller.ts#L68)

**Description:**

```typescript
const userEmail = (user?.email || "unknown@example.com") as string;
```

If a user's JWT payload lacks an `email` claim, the API key is associated with `"unknown@example.com"`. Multiple users could generate API keys associated with this fallback email, creating confusion in audit logs.

**Impact:** Low. Primarily an auditing concern, not a direct security vulnerability.

**Recommendation:** Require a valid email in the JWT or reject API key generation if email is missing. Alternatively, fall back to the user's `sub` claim for identification.

---

## Documentation vs. Code Discrepancies

### D-1: Documentation Shows `client_id` in Logout URL — Code Does Not

The AUTHENTICATION.md documentation mentions `post_logout_redirect_uri` in logout, but the code omits `client_id`. The code and documentation should align on whether `client_id` is included (see finding M-3).

### D-2: Documentation Shows Separate `api-key-auth.decorator.ts` in File Structure

The module structure section in AUTHENTICATION.md lists `api-key-auth.decorator.ts` under the auth module. This file exists but is dead code — the actual `ApiKeyAuth` decorator used throughout the app is in `src/decorators/custom-auth-decorators.ts`, which is not mentioned in the documentation.

### D-3: Guard Execution Order in Docs vs. Actual NestJS Behavior

The documentation states guard order as: JwtAuthGuard → ApiKeyAuthGuard → RolesGuard → CsrfGuard. In NestJS, `APP_GUARD` providers execute in registration order, which matches the module definition. However, this order means **CsrfGuard runs last** — after `RolesGuard`. This is the correct order since CSRF should validate after authentication is established. The documentation accurately reflects this.

### D-4: Documentation Token Refresh Flow Shows `/api/auth/me` Call After Refresh

The sequence diagram (step 8-9 of the Token Refresh Flow) shows the frontend calling `/api/auth/me` after a refresh. In the actual code, the frontend does NOT call `/me` after refresh — it simply updates `expires_at` from the `expires_in` response field. This is a minor documentation inaccuracy.

### D-5: Documentation References `@ApiKeyAuth()` from `auth/api-key-auth.decorator.ts`

The documentation shows `@ApiKeyAuth()` imported from the auth module. The actual code uses `@ApiKeyAuth()` from `@/decorators/custom-auth-decorators`, which includes additional Swagger decorators. The behavior is the same (both set the same metadata key), but the import path is wrong in the docs.

---

## Positive Security Observations

The following aspects of the implementation are well-done and follow security best practices:

1. **PKCE with S256**: Properly implemented using `openid-client` — code verifier is cryptographically random, code challenge uses SHA-256, and the verifier is stored in an HttpOnly cookie, not URL parameters.

2. **Nonce validation**: Implemented via `openid-client`'s `expectedNonce` parameter, preventing ID token replay attacks.

3. **State parameter validation**: The controller explicitly validates `pkceData.state !== query.state` before proceeding with the callback, preventing CSRF on the OAuth flow itself.

4. **HttpOnly cookies for tokens**: Access, refresh, and ID tokens are all stored in HttpOnly cookies, preventing JavaScript access and XSS-based token theft.

5. **Cookie path scoping**: Refresh token is scoped to `/api/auth/refresh`, ID token to `/api/auth`, and PKCE verifier to `/api/auth/callback`. This follows the principle of least privilege — these cookies are only sent to the endpoints that need them.

6. **CSRF double-submit pattern**: Correctly implemented with a non-HttpOnly CSRF cookie and header comparison. The guard properly exempts safe methods, Bearer token requests, and API key requests.

7. **JWKS caching with rate limiting**: The Passport JWT strategy uses `jwks-rsa` with `cache: true` and `rateLimit: true` (5 requests/minute), preventing JWKS endpoint abuse.

8. **JWT audience and issuer validation**: Both claims are validated in the Passport strategy, preventing token confusion attacks.

9. **PKCE cookie TTL**: 2-minute maximum age prevents stale PKCE state from being exploited.

10. **API key hashing**: API keys are hashed with bcrypt (cost factor 10) before storage. Full keys are returned only once at creation.

11. **API key prefix-based lookup**: The service uses the key prefix for database lookup before bcrypt comparison, avoiding full-table scans.

12. **ValidationPipe with whitelist and forbidNonWhitelisted**: Global validation pipe strips unknown properties and rejects non-whitelisted fields, preventing mass assignment attacks.

13. **Callback error handling redirects to frontend**: On callback failure, the user is redirected to the frontend with an `auth_error` parameter rather than seeing a raw error page, and the frontend cleans up this parameter from the URL.

14. **Single-flight refresh pattern**: The frontend API service deduplicates concurrent 401-triggered refresh calls, preventing refresh token race conditions.

15. **Test coverage**: The auth module has unit tests for the service, controller, CSRF guard, and API key guard, covering both happy paths and error scenarios (state mismatch, missing cookies, invalid keys).
