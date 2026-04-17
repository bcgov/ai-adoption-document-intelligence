# Configuration Security Analysis

**Analysis Date**: 2026-04-09
**Scope**: 18 configuration files analyzed

## Configuration Files Reviewed

| File | Type | Security Relevant |
|------|------|-------------------|
| src/main.ts | Application bootstrap | YES — Helmet, CORS, body parser, validation |
| src/app.module.ts | Module config | YES — Guards, throttler |
| src/auth/auth.config.ts | Auth configuration | YES — Rate limits, cookie config |
| src/auth/auth.module.ts | Guard registration | YES — 4 APP_GUARD providers |
| Dockerfile | Container build | YES — User, ports |
| docker-compose.yml | Container orchestration | YES — Credentials, ports |
| .env.sample | Environment template | YES — Secret patterns |
| src/env-loader.ts | Environment loading | YES — Secret loading logic |
| tsconfig.json | TypeScript config | LOW |
| nest-cli.json | NestJS config | LOW |
| biome.json | Linter config | LOW |
| src/database/prisma.service.ts | Database connection | YES |
| src/utils/database-url.ts | DB URL construction | YES |

## Security Headers Assessment

| Header | Status | Configuration Location |
|--------|--------|----------------------|
| HSTS | ✅ Present — 1 year, includeSubDomains | src/main.ts (Helmet) |
| CSP | ✅ Present — defaultSrc: ['self'] | src/main.ts (Helmet) |
| X-Frame-Options | ✅ Present — deny | src/main.ts (Helmet frameguard) |
| X-Content-Type-Options | ✅ Present — nosniff | src/main.ts (Helmet) |
| Referrer-Policy | ✅ Present — strict-origin-when-cross-origin | src/main.ts (Helmet) |
| Permissions-Policy | ❌ Missing | Not configured |

## Findings

### Finding CFG-1: CORS Credentials with Localhost Default — HIGH

**File**: `apps/backend-services/src/main.ts`
**Lines**: 99-102
**Evidence**:
```typescript
// File: src/main.ts, lines 99-102
app.enableCors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
});
```
**Analysis**: CORS origin defaults to `http://localhost:3000` when `FRONTEND_URL` is not set. Combined with `credentials: true`, a misconfigured production deployment (missing FRONTEND_URL) would silently allow credential-bearing requests from localhost. The fallback should require explicit configuration in production.
**Impact**: High — missing FRONTEND_URL in production silently relaxes CORS
**OWASP**: A05:2021 Security Misconfiguration
**CWE**: CWE-942 (Permissive CORS Policy)
**Recommendation**: Validate FRONTEND_URL is set in production; fail startup if missing. Remove localhost default or restrict to development mode.

### Finding CFG-2: Docker Compose Hardcoded Default Credentials — HIGH

**File**: `apps/backend-services/docker-compose.yml`
**Lines**: 19-23
**Evidence**:
```yaml
# File: docker-compose.yml, lines 19-23
MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
```
**Analysis**: Default MinIO credentials in compose file visible in version control. While environment variable override is supported, defaults are well-known.
**Impact**: High — default credentials exposed; any localhost service can access MinIO
**OWASP**: A05:2021 Security Misconfiguration
**CWE**: CWE-798 (Hard-coded Credentials)
**Recommendation**: Remove defaults; require explicit environment variables for all credentials.

### Finding CFG-3: Missing Permissions-Policy Header — MEDIUM

**File**: `apps/backend-services/src/main.ts`
**Lines**: 27-65
**Evidence**:
```typescript
// File: src/main.ts, lines 27-65
app.use(helmet({
  contentSecurityPolicy: { ... },
  hsts: { maxAge: 31_536_000, includeSubDomains: true },
  frameguard: { action: "deny" },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // No Permissions-Policy configured
}));
```
**Analysis**: No Permissions-Policy header configured. Browser features (camera, microphone, geolocation) not restricted.
**Impact**: Medium — browser feature APIs available to all origins
**OWASP**: A05:2021 Security Misconfiguration
**CWE**: CWE-16 (Configuration)
**Recommendation**: Add Permissions-Policy to restrict browser APIs: `camera=(), microphone=(), geolocation=()`.

### Finding CFG-4: TypeScript Strict Mode Disabled — MEDIUM

**File**: `apps/backend-services/tsconfig.json`
**Lines**: 14-17
**Evidence**:
```json
{
  "strictNullChecks": false,
  "noImplicitAny": false,
  "strictBindCallApply": false,
  "forceConsistentCasingInFileNames": false
}
```
**Analysis**: TypeScript strict mode disabled. `noImplicitAny: false` allows `any` types that bypass type safety in auth guards and service code. `strictNullChecks: false` allows null reference errors.
**Impact**: Medium — reduced type safety can mask security bugs in auth/authz code
**OWASP**: A04:2021 Insecure Design
**CWE**: CWE-1104 (Use of Unmaintained Third Party Components)
**Recommendation**: Enable `strictNullChecks` and `noImplicitAny` incrementally.

### Finding CFG-5: Swagger/OpenAPI Endpoint Not Protected — MEDIUM

**File**: `apps/backend-services/src/main.ts`
**Lines**: ~75
**Evidence**:
```typescript
// File: src/main.ts
SwaggerModule.setup("api", app, document);
// No authentication guard on /api Swagger UI
```
**Analysis**: Swagger UI accessible at `/api` without authentication. Exposes all API endpoints, request/response schemas, and parameter details.
**Impact**: Medium — information disclosure aids attack reconnaissance
**OWASP**: A05:2021 Security Misconfiguration
**CWE**: CWE-200 (Information Exposure)
**Recommendation**: Restrict Swagger UI to development/staging environments. In production, either disable or add authentication.

### Finding CFG-6: Unbounded Body Size Limit — MEDIUM

**File**: `apps/backend-services/src/main.ts`
**Lines**: ~89
**Evidence**:
```typescript
// File: src/main.ts
app.use(json({ limit: process.env.BODY_LIMIT || "50mb" }));
```
**Analysis**: Body size limit configurable via environment variable without validation. A misconfigured BODY_LIMIT (e.g., "10gb") could cause memory exhaustion. Default 50MB is reasonable.
**Impact**: Medium — unvalidated env var could enable memory DoS
**OWASP**: A05:2021 Security Misconfiguration
**CWE**: CWE-770 (Allocation of Resources Without Limits)
**Recommendation**: Validate BODY_LIMIT value at startup (e.g., max 100MB).

### Finding CFG-7: CSP Allows unsafe-inline for Scripts — MEDIUM

**File**: `apps/backend-services/src/main.ts`
**Lines**: 37
**Evidence**:
```typescript
// File: src/main.ts, line 37
scriptSrc: ["'self'", "'unsafe-inline'"],
```
**Analysis**: CSP `scriptSrc` includes `'unsafe-inline'` to support Swagger UI. This weakens XSS protection for the Swagger endpoint.
**Impact**: Medium — inline scripts bypass CSP; mitigated by Swagger being the only HTML-serving endpoint
**OWASP**: A03:2021 Injection
**CWE**: CWE-79 (Cross-site Scripting)
**Recommendation**: Serve Swagger UI from a separate route with its own CSP policy. Use nonce-based CSP for inline scripts.

### Finding CFG-8: Prisma Query Logging May Expose Data — MEDIUM

**File**: `apps/backend-services/src/database/prisma.service.ts`
**Lines**: ~58
**Evidence**:
```typescript
// File: src/database/prisma.service.ts
// PRISMA_LOG_QUERIES=true enables query parameter logging
```
**Analysis**: If `PRISMA_LOG_QUERIES=true` is set, Prisma logs SQL queries with parameters, potentially including user data.
**Impact**: Medium — sensitive query parameters logged to stdout
**OWASP**: A09:2021 Security Logging & Monitoring Failures
**CWE**: CWE-532 (Sensitive Information in Log File)
**Recommendation**: Ensure PRISMA_LOG_QUERIES is never enabled in production. Add startup check.

## Positive Configuration Practices

1. **Strong Helmet Configuration**: HSTS (1 year), CSP, X-Frame-Options: deny, noSniff, Referrer-Policy
2. **4-Guard Authentication Chain**: JwtAuthGuard → ApiKeyAuthGuard → IdentityGuard → CsrfGuard
3. **Per-IP Rate Limiting**: 20 failed API key attempts per 60s; auth endpoints at 10 req/min
4. **Non-Root Docker**: Dockerfile uses user 1001 with permissions isolation
5. **Database SSL Support**: PGSSLMODE and PGSSLREJECTUNAUTHORIZED configuration supported
6. **External Secret Loading**: $DI_SECRETS_DIR loads secrets from external mount
7. **Global Validation Pipe**: whitelist + forbidNonWhitelisted + transform enforced globally
8. **RS256 JWT Algorithm Enforcement**: prevents algorithm confusion attacks
9. **Body Size Limit**: 50MB default prevents unbounded uploads
