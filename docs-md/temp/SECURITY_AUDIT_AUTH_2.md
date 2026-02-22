# Authentication & Authorization Security Audit

**Date:** 2026-02-21 (updated 2026-02-21)
**Auditor:** Automated deep-code review
**Scope:** Full security review of the OAuth 2.0 / Keycloak authentication implementation, CSRF protection, API key authentication, cookie management, frontend auth context, route protection coverage, dead code analysis, and documentation accuracy.

**Files reviewed:**
- All files under `apps/backend-services/src/auth/` (service, controller, guards, strategy, DTOs, utils, decorators, tests)
- `apps/backend-services/src/api-key/` (service, controller, module, DTOs, tests)
- `apps/backend-services/src/decorators/custom-auth-decorators.ts`
- `apps/backend-services/src/main.ts` (middleware, CORS, helmet, validation pipe)
- `apps/backend-services/src/app.module.ts` (global guards, throttler config)
- All controller files across the backend (document, upload, ocr, azure, hitl, training, workflow, labeling)
- `apps/frontend/src/auth/AuthContext.tsx`
- `apps/frontend/src/data/services/api.service.ts`
- `apps/frontend/src/App.tsx`, `apps/frontend/src/main.tsx`
- `apps/frontend/nginx-default.conf`, `apps/frontend/nginx.conf`
- `docs-md/AUTHENTICATION.md`

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Architecture Overview](#architecture-overview)
- [Findings Summary](#findings-summary)
- [Findings — High](#findings--high)
- [Findings — Medium](#findings--medium)
- [Findings — Low / Informational](#findings--low--informational)
- [Dead Code & Cleanup](#dead-code--cleanup)
- [Route Protection Audit](#route-protection-audit)
- [Documentation vs Code Accuracy](#documentation-vs-code-accuracy)
- [Positive Security Observations](#positive-security-observations)

---

## Executive Summary

The authentication architecture follows a sound design: **confidential OAuth 2.0 Authorization Code Flow with PKCE**, HttpOnly cookies, CSRF double-submit pattern, JWKS-based JWT validation, and Helmet security headers. The core OAuth flow is well-implemented using `openid-client` for OIDC discovery, PKCE, nonce validation, and token exchange.

A previous security audit (archived in `docs-md/temp/SECURITY_AUDIT_AUTH.md`) identified 17 findings, of which 12 have been resolved. This follow-up audit validates those resolutions and identifies **6 new or persisting findings** along with **3 dead code items** and **2 documentation discrepancies**.

### Risk Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **High** | 0 | — |
| **Medium** | 4 | Missing resource-level authorization (documented), PKCE cookie not cleared on error (resolved), no `@Roles()` usage, API key validation not rate-limited (resolved) |
| **Low** | 4 | Dead code (resolved), CSRF timing comparison, `getCookie` regex injection |

---

## Architecture Overview

The system uses a multi-layer guard stack registered globally via NestJS `APP_GUARD`:

| Order | Guard | Registered In | Purpose |
|-------|-------|---------------|---------|
| 1 | `ThrottlerGuard` | `AppModule` | Rate limiting (100 req/60s default) |
| 2 | `JwtAuthGuard` | `AuthModule` | JWT validation (cookie-first, Bearer fallback); skips `@Public()` |
| 3 | `ApiKeyAuthGuard` | `AuthModule` | API key validation for `@ApiKeyAuth()` routes; failed-attempt throttling (default 20/min/IP, env-configurable) |
| 4 | `RolesGuard` | `AuthModule` | RBAC enforcement via `@Roles()` (currently unused) |
| 5 | `CsrfGuard` | `AuthModule` | Double-submit cookie CSRF on state-changing methods |

Because `JwtAuthGuard` is a global guard, **every route requires JWT authentication by default** unless marked `@Public()`. The `@KeycloakSSOAuth()` and `@ApiKeyAuth()` decorators are primarily Swagger documentation aids — actual protection comes from the global guard stack.

---

## Findings Summary

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| H-1 | Duplicate PrismaClient instances in ApiKeyService and WorkflowService | **High** | Resolved |
| M-1 | No resource-level authorization (IDOR) on most endpoints | **Medium** | Documented |
| M-2 | PKCE cookie not cleared on state mismatch error path | **Medium** | Resolved |
| M-3 | `@Roles()` decorator never used — RBAC not enforced | **Medium** | Open (from previous audit M-6) |
| M-4 | No rate limiting on API key validation path | **Medium** | Resolved |
| L-1 | `useSSO` export in AuthContext.tsx is dead code | **Low** | Resolved |
| L-2 | Legacy `BCGovAuthGuard` comment in jwt-auth.guard.ts | **Low** | Resolved |
| L-3 | CSRF comparison uses `!==` not `timingSafeEqual` | **Low** | Open |
| L-4 | `getCookie()` in AuthContext.tsx doesn't escape regex | **Low** | Open |

---

## Findings — High

### H-1: ~~Duplicate PrismaClient Instances — Connection Pool Leak~~ — RESOLVED

**Severity:** High
**Status:** Resolved
**Files:**
- [apps/backend-services/src/api-key/api-key.service.ts](../apps/backend-services/src/api-key/api-key.service.ts)
- [apps/backend-services/src/workflow/workflow.service.ts](../apps/backend-services/src/workflow/workflow.service.ts)

**Resolution:** Both `ApiKeyService` and `WorkflowService` have been refactored to inject the shared `PrismaService` from `DatabaseModule` instead of creating their own `PrismaClient` instances. `ApiKeyModule` and `WorkflowModule` now import `DatabaseModule`. The duplicate connection pools, missing `$disconnect()` calls, and bypassed central configuration are all resolved.

---

## Findings — Medium

### M-1: No Resource-Level Authorization (IDOR) on Most Endpoints — DOCUMENTED

**Severity:** Medium-High
**Status:** Documented in AUTHENTICATION.md and docs site
**Files:** Multiple controllers

**Description:** While all endpoints are protected by authentication (JWT or API key), there are **no ownership or tenant-level authorization checks** on most resource endpoints. Any authenticated user can access or modify any resource by ID:

| Endpoint | Risk |
|----------|------|
| `GET /api/documents/:id/ocr` | Any user can read any document's OCR results |
| `GET /api/documents/:id/download` | Any user can download any document |
| `POST /api/documents/:id/approve` | Any user can approve/reject any document |
| `GET/POST /api/hitl/sessions/:id/*` | Any user can interact with any HITL session |
| `GET/PUT/DELETE /api/labeling/projects/:id/*` | Any user can modify any labeling project |
| `GET/PUT/DELETE /api/training/projects/:id/*` | Any user can view/train/delete any training job |

**Exceptions (properly scoped):**
- `WorkflowService` — passes `userId` to service methods for ownership checks
- `AzureController` — checks `isUserInGroup()` at the service level
- `ApiKeyController` — scopes operations to `req.user.sub`

**Impact:** Insecure Direct Object Reference (IDOR). An authenticated user can enumerate and access other users' resources by guessing or iterating over resource IDs (CUIDs are not sequential but are not secret either).

**Recommendation:** Add resource ownership validation at the service layer. Either:
- Filter queries by `userId` (e.g., `WHERE user_id = $1 AND id = $2`)
- Check ownership after retrieval and throw `ForbiddenException` if `resource.userId !== req.user.sub`
- Implement a tenant/organization scoping middleware

---

### M-2: ~~PKCE Cookie Not Cleared on State Mismatch Error Path~~ — RESOLVED

**Severity:** Medium
**Status:** Resolved
**File:** [apps/backend-services/src/auth/auth.controller.ts](../apps/backend-services/src/auth/auth.controller.ts)

**Resolution:** The `clearCookie` call has been moved before the state validation check, so the PKCE cookie is always cleared regardless of whether state validation passes or fails. The cookie containing `codeVerifier`, `nonce`, and `state` no longer persists after a failed state check.

---

### M-3: `@Roles()` Decorator Never Used — RBAC Not Enforced

**Severity:** Medium
**Files:** Codebase-wide (no `@Roles()` usage found in any controller)

**Description:** The `RolesGuard` is registered as a global `APP_GUARD` and is fully implemented and tested. The `@Roles()` decorator exists in [roles.decorator.ts](../apps/backend-services/src/auth/roles.decorator.ts). However, a codebase-wide search confirms **zero controllers use `@Roles()`**. The `RolesGuard` always returns `true` because `requiredRoles` is always `undefined`.

This means the application operates on a **binary authenticated/unauthenticated model** — all authenticated users have identical access to all endpoints. There is no role differentiation between regular users, admins, reviewers, etc.

**Impact:** Any authenticated user can perform any action: approve documents, delete workflows, train models, manage API keys (for their own account). If the Keycloak realm has different roles configured, they are extracted and normalized but never enforced.

**Recommendation:** Either:
1. Apply `@Roles()` on sensitive endpoints (admin operations, delete endpoints, training triggers)
2. Or document that RBAC enforcement is intentionally deferred and the guard is infrastructure-ready for future use

---

### M-4: ~~No Rate Limiting on API Key Validation Path~~ — RESOLVED

**Severity:** Medium
**Status:** Resolved
**Files:**
- [apps/backend-services/src/auth/api-key-auth.guard.ts](../apps/backend-services/src/auth/api-key-auth.guard.ts)
- [apps/backend-services/src/api-key/api-key.service.ts](../apps/backend-services/src/api-key/api-key.service.ts#L121-L147)

**Resolution:** The `ApiKeyAuthGuard` now tracks failed API key validation attempts per IP address using an in-memory `Map`. After the configured limit (default: **20 failed attempts**) within the configured window (default: 60 seconds), further requests from the same IP are blocked with `429 Too Many Requests` before reaching the database query or bcrypt comparison. The counter resets on successful validation or when the window expires. Stale records are swept at the configured interval (default: 60 seconds) via `setInterval` to prevent unbounded memory growth. The guard implements `OnModuleDestroy` to clean up the sweep interval. All thresholds are env-configurable via `auth.config.ts`.

---

## Findings — Low / Informational

### L-1: ~~`useSSO` Export Is Dead Code~~ — RESOLVED

**Status:** Resolved
**File:** [apps/frontend/src/auth/AuthContext.tsx](../apps/frontend/src/auth/AuthContext.tsx)

**Resolution:** The `useSSO` backwards-compatibility alias has been removed.

---

### L-2: ~~Legacy `BCGovAuthGuard` Comment~~ — RESOLVED

**Status:** Resolved
**File:** [apps/backend-services/src/auth/jwt-auth.guard.ts](../apps/backend-services/src/auth/jwt-auth.guard.ts)

**Resolution:** The stale JSDoc reference to `BCGovAuthGuard` has been removed from the guard's documentation comment.

---

### L-3: CSRF Token Comparison Uses `!==` Not `timingSafeEqual`

**File:** [apps/backend-services/src/auth/csrf.guard.ts](../apps/backend-services/src/auth/csrf.guard.ts#L57)

```typescript
csrfCookie !== csrfHeader
```

This uses JavaScript's standard string comparison which is theoretically vulnerable to timing attacks. However, this is **not practically exploitable** because:
- The `csrf_token` cookie is a non-HttpOnly cookie readable by JavaScript — it is not a secret from the browser
- The double-submit pattern's security comes from the Same-Origin Policy preventing cross-site cookie reading, not from timing-safe comparison
- A timing attack requires the attacker to already be on the same origin, at which point they can just read the cookie directly

**Recommendation:** Using `crypto.timingSafeEqual` would be a defense-in-depth improvement but is not required for security.

---

### L-4: `getCookie()` Regex Injection in AuthContext.tsx

**File:** [apps/frontend/src/auth/AuthContext.tsx](../apps/frontend/src/auth/AuthContext.tsx#L68-L71)

```typescript
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
```

The `name` parameter is interpolated directly into a `RegExp` without escaping special characters. If `name` contained regex metacharacters, the match could produce incorrect results. In practice, the only caller passes `"csrf_token"` which is safe.

**Recommendation:** Either escape the name for regex safety or use the string-split approach already present in the same codebase ([api.service.ts](../apps/frontend/src/data/services/api.service.ts) uses `.split('; ').find()`).

---

## Dead Code & Cleanup

| Item | File | Description | Action |
|------|------|-------------|--------|
| ~~`useSSO` export~~ | `apps/frontend/src/auth/AuthContext.tsx` | Backwards-compat alias never imported anywhere | Removed |
| ~~`BCGovAuthGuard` comment~~ | `apps/backend-services/src/auth/jwt-auth.guard.ts` | Reference to non-existent guard class | Removed |
| ~~`test-upload.js` and `test-upload.sh`~~ | `apps/backend-services/` | Development test scripts committed to repo | Removed (files deleted, references cleaned from README.md, TESTING.md, biome.json) |

---

## Route Protection Audit

### All Routes by Controller

Every route was verified against the global guard stack. Below is the complete inventory:

#### Auth Controller (`api/auth`)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/api/auth/login` | `@Public()` | 10/min | Initiates OAuth flow |
| GET | `/api/auth/callback` | `@Public()` | 10/min | Receives Keycloak redirect |
| POST | `/api/auth/refresh` | `@Public()` | 5/min | Reads refresh_token cookie |
| GET | `/api/auth/logout` | `@Public()` | 10/min | Clears cookies, redirects to Keycloak |
| GET | `/api/auth/me` | JWT required | Global default | Returns user profile |

All `@Public()` routes are **correctly public** — they implement the OAuth flow and cannot require a valid access token.

#### Document Controller (`api/documents`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/documents` | JWT | — |
| GET | `/api/documents/:id/ocr` | JWT or API Key | — |
| GET | `/api/documents/:id/download` | JWT | — |
| POST | `/api/documents/:id/approve` | JWT | Yes |

#### Upload Controller (`api/upload`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| POST | `/api/upload` | JWT or API Key | Yes |

#### API Key Controller (`api/api-key`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/api-key` | JWT | — |
| POST | `/api/api-key` | JWT | Yes |
| DELETE | `/api/api-key` | JWT | Yes |
| POST | `/api/api-key/regenerate` | JWT | Yes |

#### HITL Controller (`api/hitl`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/hitl/queue` | JWT or API Key | — |
| GET | `/api/hitl/queue/stats` | JWT or API Key | — |
| POST | `/api/hitl/sessions` | JWT or API Key | Yes |
| GET | `/api/hitl/sessions/:id` | JWT or API Key | — |
| POST | `/api/hitl/sessions/:id/corrections` | JWT or API Key | Yes |
| GET | `/api/hitl/sessions/:id/corrections` | JWT or API Key | — |
| POST | `/api/hitl/sessions/:id/submit` | JWT or API Key | Yes |
| POST | `/api/hitl/sessions/:id/escalate` | JWT or API Key | Yes |
| POST | `/api/hitl/sessions/:id/skip` | JWT or API Key | Yes |
| GET | `/api/hitl/analytics` | JWT or API Key | — |

#### Azure Controller (`api/azure`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| POST | `/api/azure/classifier` | JWT | Yes |
| POST | `/api/azure/classifier/documents` | JWT | Yes |
| DELETE | `/api/azure/classifier/documents` | JWT | Yes |
| POST | `/api/azure/classifier/train` | JWT | Yes |
| POST | `/api/azure/classifier/classify` | JWT | Yes |
| GET | `/api/azure/classifier/classify` | JWT | — |
| GET | `/api/azure/classifier/train` | JWT | — |

#### Workflow Controller (`api/workflows`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/workflows` | JWT or API Key | — |
| GET | `/api/workflows/:id` | JWT or API Key | — |
| POST | `/api/workflows` | JWT or API Key | Yes |
| PUT | `/api/workflows/:id` | JWT or API Key | Yes |
| DELETE | `/api/workflows/:id` | JWT or API Key | Yes |

#### Labeling Controller (`api/labeling`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/labeling/projects` | JWT or API Key | — |
| POST | `/api/labeling/projects` | JWT or API Key | Yes |
| GET | `/api/labeling/projects/:id` | JWT or API Key | — |
| PUT | `/api/labeling/projects/:id` | JWT or API Key | Yes |
| DELETE | `/api/labeling/projects/:id` | JWT or API Key | Yes |
| GET | `/api/labeling/projects/:id/fields` | JWT or API Key | — |
| POST | `/api/labeling/projects/:id/fields` | JWT or API Key | Yes |
| PUT | `/api/labeling/projects/:id/fields/:fieldId` | JWT or API Key | Yes |
| DELETE | `/api/labeling/projects/:id/fields/:fieldId` | JWT or API Key | Yes |
| GET | `/api/labeling/projects/:id/documents` | JWT or API Key | — |
| POST | `/api/labeling/projects/:id/documents` | JWT or API Key | Yes |
| POST | `/api/labeling/projects/:id/upload` | JWT or API Key | Yes |
| GET | `/api/labeling/projects/:id/documents/:docId` | JWT or API Key | — |
| GET | `/api/labeling/projects/:id/documents/:docId/download` | JWT or API Key | — |
| DELETE | `/api/labeling/projects/:id/documents/:docId` | JWT or API Key | Yes |
| GET | `/api/labeling/projects/:id/documents/:docId/labels` | JWT or API Key | — |
| POST | `/api/labeling/projects/:id/documents/:docId/labels` | JWT or API Key | Yes |
| DELETE | `/api/labeling/projects/:id/documents/:docId/labels/:labelId` | JWT or API Key | Yes |
| GET | `/api/labeling/projects/:id/documents/:docId/ocr` | JWT or API Key | — |
| POST | `/api/labeling/projects/:id/export` | JWT or API Key | Yes |

#### Training Controller (`api/training`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/training/projects/:id/validate` | JWT or API Key | — |
| POST | `/api/training/projects/:id/train` | JWT or API Key | Yes |
| GET | `/api/training/projects/:id/jobs` | JWT or API Key | — |
| GET | `/api/training/jobs/:id` | JWT or API Key | — |
| GET | `/api/training/projects/:id/models` | JWT or API Key | — |
| DELETE | `/api/training/jobs/:id` | JWT or API Key | Yes |

#### OCR Controller (`api`)

| Method | Path | Auth | CSRF |
|--------|------|------|------|
| GET | `/api/models` | JWT | — |

### Route Protection Summary

- **Total routes:** 55+
- **Public routes:** 4 (all in AuthController, all rate-limited)
- **Unprotected routes:** 0
- **All POST/PUT/DELETE routes:** Protected by CSRF guard for cookie-authenticated requests
- **All routes:** Protected by global `ThrottlerGuard`

---

## Documentation vs Code Accuracy

The existing `docs-md/AUTHENTICATION.md` is **comprehensive and largely accurate** (1966 lines). The following minor discrepancies were noted:

| Item | Status |
|------|--------|
| Guard execution order matches code registration order | Accurate |
| Cookie configurations match code | Accurate |
| PKCE flow description | Accurate |
| Module file structure | Accurate (dead file `api-key-auth.decorator.ts` was previously removed) |
| Refresh flow diagram shows no `/me` call after refresh | Accurate (previously corrected) |
| `@Roles()` described as available but notes indicate it's not currently used | Sufficiently documented |
| Frontend auth architecture description | Accurate |
| Rate limiting documentation | Accurate — all limits match `@Throttle()` decorators and `auth.config.ts` constants |

**No new documentation-code discrepancies found.**

---

## Positive Security Observations

The following aspects are well-implemented and represent security best practices:

1. **PKCE with S256** — Properly implemented via `openid-client`. Code verifier is cryptographically random, code challenge uses SHA-256, verifier stored in HttpOnly cookie (never in URL).

2. **Nonce validation** — Implemented via `openid-client`'s `expectedNonce` parameter, preventing ID token replay attacks.

3. **State parameter validation** — Controller explicitly validates `pkceData.state !== query.state` before token exchange.

4. **HttpOnly cookies for all tokens** — Access, refresh, and ID tokens are all HttpOnly. JavaScript cannot access them.

5. **Cookie path scoping** — Refresh token scoped to `/api/auth/refresh`, ID token to `/api/auth`, PKCE verifier to `/api/auth/callback`. Principle of least privilege.

6. **CSRF double-submit pattern** — Correctly implemented. Exempts safe methods, Bearer tokens, API keys. Guards state-changing requests appropriately.

7. **JWKS caching with rate limiting** — `jwks-rsa` configured with `cache: true` and `rateLimit: true` (5 requests/minute), preventing JWKS endpoint abuse.

8. **JWT audience and issuer validation** — Both claims validated in the Passport strategy, preventing token confusion attacks.

9. **PKCE cookie TTL** — 2-minute `maxAge` prevents stale PKCE material from lingering.

10. **API key bcrypt hashing** — Keys hashed with bcrypt (cost 10) before storage. Full keys returned only once at creation.

11. **API key prefix-based lookup** — DB query uses `key_prefix` for indexed lookup before bcrypt comparison, avoiding full-table scans.

12. **ValidationPipe configuration** — Global `whitelist: true` and `forbidNonWhitelisted: true` strips unknown properties and rejects non-whitelisted fields (mass assignment prevention).

13. **Helmet security headers** — HSTS (1 year, includeSubDomains), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, CSP configured, X-Powered-By removed. Verified by integration tests.

14. **Rate limiting infrastructure** — Global `ThrottlerGuard` (default 100 req/min, env-configurable) with per-route overrides on auth endpoints. All limits configurable via environment variables in `auth.config.ts`. Integration tests verify 429 behavior.

15. **Generic error messages** — Auth service returns generic `"Authentication failed"` / `"Token refresh failed"` to clients while logging full details server-side. Verified by tests.

16. **Single-flight refresh pattern** — Frontend deduplicates concurrent 401-triggered refresh calls, preventing refresh token race conditions.

17. **Frontend never handles raw tokens** — All token operations happen server-side. Frontend determines auth state via `/api/auth/me` and refreshes via cookie-based `/api/auth/refresh`.

18. **CORS properly configured** — Single static origin (not reflected), `credentials: true` correctly paired with specific origin (not `*`).

19. **Nginx security headers** — Frontend nginx config includes X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and HSTS.

20. **Comprehensive test coverage** — Unit tests for auth service (10+ tests), controller (10+ tests), CSRF guard (8 tests), JWT auth guard (8 tests), API key auth guard (7 tests), roles guard (11 tests), cookie utils (13 tests), security headers (6 integration tests), and throttle behavior (8 tests including integration).

---

## Previous Audit Resolution Status

The following findings from the previous audit (`docs-md/temp/SECURITY_AUDIT_AUTH.md`) have been verified as resolved:

| ID | Finding | Resolution |
|----|---------|------------|
| C-1 | No rate limiting | `@nestjs/throttler` added globally + per-route overrides |
| C-2 | No security headers | Helmet middleware + nginx headers added |
| H-1 | CSRF token no `maxAge` | `maxAge` now matches access token lifetime |
| H-2 | API key empty roles | Roles stored in DB and populated on auth |
| H-3 | Duplicate ApiKeyAuth decorator | Dead file deleted |
| H-4 | Auth error message leaks | Generic messages returned, details logged server-side |
| M-1 | Refresh endpoint `@Public()` | Documented as accepted trade-off with layered protections |
| M-3 | Logout missing `client_id` | `client_id` now always included |
| L-4 | LogoutQueryDto unused | Dead file deleted |
| L-5 | API key email fallback | `BadRequestException` thrown when email missing |
| D-1/D-3/D-4 | Documentation discrepancies | All corrected |

### Still open from previous audit:

| ID | Finding | Notes |
|----|---------|-------|
| M-2 | CORS single origin | Functional limitation, not a vulnerability. Current config is safe. |
| M-4 | PKCE cookie plain JSON | Mitigated by HttpOnly + 2-min TTL. Server-side PKCE storage is stronger but adds complexity. |
| M-5 | Cookie `secure` flag via `NODE_ENV` | Defaults to secure. Risk only if `NODE_ENV=development` set in production. |
| M-6 | No `@Roles()` usage | Carried forward as M-3 in this audit. |
| L-1 | Nginx security headers | Now resolved — headers present in `nginx-default.conf`. |
| L-2 | CSRF `sameSite` difference | Intentional and correct. No action needed. |
| L-3 | TokenResponseDto no validation | Internal DTO, acceptable. |
