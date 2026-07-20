# Code Vulnerabilities Analysis

**Analysis Date**: 2026-04-09
**Scope**: 140 source files, 91 DTO files
**Trivy Code Findings**: 0

## Summary

| Category | Findings | Highest Severity |
|----------|----------|-----------------|
| SQL Injection | 0 | — |
| XSS | 0 | — |
| CSRF | 0 | — |
| Deserialization | 0 | — |
| Path Traversal | 0 | — |
| Command Injection | 0 | — |
| XXE | 0 | — |
| SSRF | 0 | — |
| Open Redirect | 0 | — |
| Data Exposure | 1 | Informational |
| Input Validation | 0 | — |

## Findings

### SQL Injection Analysis

**Finding**: ✅ NO VULNERABILITIES

All database operations use Prisma's type-safe parameterized query builder. No instances of `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, or `$executeRawUnsafe` found. No string concatenation in SQL queries.

### Cross-Site Scripting (XSS) Analysis

**Finding**: ✅ NO VULNERABILITIES

All responses use typed DTOs serialized safely. Helmet CSP enforces `defaultSrc: ['self']`. X-Content-Type-Options: nosniff prevents MIME-type sniffing XSS. ValidationPipe strips unknown properties and rejects non-whitelisted input.

### CSRF Analysis

**Finding**: ✅ NO VULNERABILITIES (Protection Implemented)

CsrfGuard (`src/auth/csrf.guard.ts`) implements double-submit cookie pattern. Safe method detection (GET/HEAD/OPTIONS bypass). Bearer/API-key authenticated requests bypass (not cookie-vulnerable). CSRF token generated with `crypto.randomBytes(32)` (256-bit entropy).

### Insecure Deserialization Analysis

**Finding**: ✅ NO VULNERABILITIES

JSON.parse usage is limited to: JWT payload (cryptographically verified by Keycloak), HttpOnly server-set cookies read back server-side, database JSON fields (trusted Prisma data), LLM output with try/catch error handling.

### Path Traversal Analysis

**Finding**: ✅ NO VULNERABILITIES

`src/benchmark/dataset.service.ts` validates file paths:
```typescript
const normalizedPath = path.normalize(filePath);
if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath) || normalizedPath.includes("../")) {
  throw new BadRequestException("Invalid file path");
}
```
All blob storage operations use UUID-based keys. Test coverage confirms `../../etc/passwd` is rejected.

### Command Injection Analysis

**Finding**: ✅ NO VULNERABILITIES

Only command execution: `execSync("git rev-parse HEAD")` in `src/benchmark/benchmark-run.service.ts` — hardcoded command string with no user input. No `eval()` usage found.

### SSRF Analysis

**Finding**: ✅ NO VULNERABILITIES

Azure SDK `pollOperation` validates URL origin against configured endpoint:
```typescript
// src/azure/azure.service.ts
const expectedOrigin = new URL(this.endpoint).origin;
if (parsedUrl.origin !== expectedOrigin) {
  throw new Error(`operationLocation origin does not match expected Azure endpoint`);
}
```
All external API targets configured via environment variables. No user-supplied URLs accepted for external requests.

### Open Redirect Analysis

**Finding**: ✅ NO VULNERABILITIES

All redirects target fixed, server-configured URLs (FRONTEND_URL env var). Auth controller redirects:
- `res.redirect(this.authService.getFrontendUrl())` — configured URL
- `this.authService.buildErrorRedirect("callback_failed")` — constructed from configured base URL
- Logout redirect uses `SSO_POST_LOGOUT_REDIRECT_URI` — environment variable

### Sensitive Data Exposure Analysis

#### Finding CV-1: Stack Trace Logging — INFORMATIONAL

**Pattern**: Stack traces logged internally but not returned to clients
**File**: Multiple files (`src/document/document.controller.ts`, `src/upload/upload.controller.ts`, `src/azure/classifier-poller.service.ts`)
**Evidence**:
```typescript
// File: src/document/document.controller.ts
catch (error) {
  this.logger.error(`Stack: ${error.stack}`); // Logged internally
  throw new BadRequestException(...); // Generic message to client
}
```
**Analysis**: Stack traces are logged to internal logging infrastructure, not returned in HTTP responses. Controllers throw typed NestJS exceptions with safe messages. Helmet security headers prevent information leakage.
**Impact**: Informational — requires secure log infrastructure with appropriate access controls
**OWASP**: A09:2021 Security Logging & Monitoring Failures
**CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
**Recommendation**: Ensure log aggregation system has appropriate access controls and retention policies.

### Input Validation Analysis

**Finding**: ✅ NO GAPS

Global ValidationPipe configured in `src/main.ts`:
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // Strip unknown properties
  transform: true,           // Transform to DTO instances
  forbidNonWhitelisted: true, // Reject unknown properties
}));
```
Comprehensive DTO validation with `@IsString()`, `@IsNotEmpty()`, `@IsEnum()`, `@Min()`, `@Max()` decorators. Enum validation on all user-controlled parameters.

## Categories With No Findings

All 11 vulnerability categories were scanned with no confirmed vulnerabilities. The application demonstrates strong security through: Prisma ORM parameterized queries, Helmet CSP headers, CSRF double-submit cookie pattern, typed DTO responses, UUID-based blob storage keys, input validation via class-validator, and hardcoded-only command execution.
