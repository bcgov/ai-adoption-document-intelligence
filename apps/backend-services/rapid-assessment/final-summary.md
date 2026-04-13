# AI OCR Backend Services - Rapid Assessment Final Summary

**Assessment Date**: 2026-04-09
**Assessment Framework**: Rapid Assessment v3.0
**Platform**: GitHub Copilot (with subagent delegation)
**Status**: COMPLETED

## Scan Metadata
- **Trivy scan**: Ran — Trivy v0.69.3, 0 HIGH/CRITICAL findings
- **Tech stack**: NestJS 11.x / TypeScript 5.9 / Node.js 24+ / PostgreSQL (Prisma 7.2.0) / Temporal.io / Azure DI + Blob / Helmet / Passport JWT
- **Files analyzed**: 252 security-relevant files (140 source + 91 DTOs + 11 config + 10 database)
- **Dependencies assessed**: 38
- **Analysis modules completed**: 10/10

## Executive Summary

### Overall Security Posture: MEDIUM

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 7 |
| Medium | 16 |
| Low | 6 |
| Informational | 1 |
| **Total** | **31** |

### Top 3 Most Critical Issues
1. **DB-1: Hardcoded Test API Key** — `apps/shared/prisma/seed.ts` line 1406 contains API key `69Ordc...STY` visible in repo history
2. **LOG-1: Missing Authentication Audit Events** — Zero audit trail for login/logout/refresh events in `src/auth/auth.controller.ts`
3. **CFG-1: CORS Credentials with Localhost Default** — `src/main.ts` line 99 defaults CORS origin to localhost with credentials=true

## Architecture Assessment

The system is a NestJS 11.x monolithic API with 20 architectural modules following a multi-tenant group-based authorization model. Key architectural strengths:

- **4-layer guard chain**: JwtAuthGuard → ApiKeyAuthGuard → IdentityGuard → CsrfGuard
- **OIDC/PKCE authentication** via Keycloak with RS256 algorithm pinning
- **Prisma ORM** eliminates SQL injection via parameterized queries
- **Temporal.io** isolates long-running workflow execution
- **Blob storage abstraction** with UUID-based keys prevents path traversal
- **Immutable audit trail** (append-only audit_event table) for document and group operations

## Critical Security Findings

### CRITICAL Issues — Immediate Action Required

**DB-1: Hardcoded Test API Key in Seed File**
- **Location**: `apps/shared/prisma/seed.ts:1406`, `playwright.config.ts:8`
- **Impact**: Anyone with repository access can authenticate as test user; full API access to associated group
- **Recommendation**: 1) Rotate key immediately. 2) Remove hardcoded default; require env var. 3) Add pre-commit hooks for secret detection.

### HIGH Priority Issues — Next Sprint

**LOG-1: Missing Authentication Audit Events**
- **Location**: `src/auth/auth.controller.ts` (login, callback, refresh, logout)
- **Impact**: Cannot detect brute force, credential stuffing, session hijacking; breach investigation impossible
- **Recommendation**: Add `authentication_success`, `authentication_failure`, `session_started` audit events

**LOG-2: Missing Authorization Failure Audit Trail**
- **Location**: `src/auth/identity.helpers.ts:64-102`, `src/group/group.service.ts`
- **Impact**: Cannot detect privilege escalation or unauthorized access attempts
- **Recommendation**: Record `access_denied` events with actor, resource, reason

**LOG-3: Stack Traces Logged to Stdout**
- **Location**: 20+ files across codebase
- **Impact**: Internal file paths, function names, library versions exposed in logs
- **Recommendation**: Log only error.message in production; use stack traces only in debug mode

**CFG-1: CORS Credentials with Localhost Default**
- **Location**: `src/main.ts:99-102`
- **Impact**: Missing FRONTEND_URL in production silently relaxes CORS
- **Recommendation**: Validate FRONTEND_URL is set in production; fail startup if missing

**DB-2: Missing Audit Columns on Multi-Tenant Tables**
- **Location**: `apps/shared/prisma/schema.prisma` (DatasetVersion, Split, BenchmarkRun, BenchmarkOcrCache)
- **Impact**: No forensic capability for security incidents on these tables
- **Recommendation**: Add created_by, updated_by, updated_at, deleted_at columns

**DB-3: Unencrypted SAS URL Storage**
- **Location**: `apps/shared/prisma/schema.prisma` (TrainingJob.sas_url)
- **Impact**: Azure Blob Storage credentials stored as plaintext in database
- **Recommendation**: Encrypt SAS URLs at rest; consider Azure Key Vault

### MEDIUM Priority Issues — Planned Remediation

**AUTH-1**: API key missing per-key rate limiting after successful auth (`src/auth/api-key-auth.guard.ts:81-95`)
**AUTH-2**: API key denial not logged to audit trail (`src/auth/identity.guard.ts:148-157`)
**AUTH-3**: Group authorization denial not audited (`src/auth/identity.helpers.ts:64-102`)
**LOG-4**: API key events not in audit trail (`src/actor/api-key.service.ts:73`)
**LOG-5**: Azure API key may appear in error logs (`src/azure/azure.service.ts:53`)
**LOG-6**: Input validation failures not logged (`src/main.ts:108-114`)
**LOG-7**: Inconsistent stack trace redaction (`packages/logging/src/logger.ts:47-56`)
**CFG-2**: Docker Compose hardcoded default credentials (`docker-compose.yml:19-23`)
**CFG-3**: Missing Permissions-Policy header (`src/main.ts:27-65`)
**CFG-4**: TypeScript strict mode disabled (`tsconfig.json:14-17`)
**CFG-5**: Swagger/OpenAPI endpoint not protected (`src/main.ts:~75`)
**CFG-6**: Unbounded body size limit env var (`src/main.ts:~89`)
**CFG-7**: CSP allows unsafe-inline for scripts (`src/main.ts:37`)
**CFG-8**: Prisma query logging may expose data (`src/database/prisma.service.ts:~58`)
**DB-4**: Inconsistent database naming conventions (`schema.prisma:5-6`)
**DB-5**: No soft delete on critical records (`schema.prisma:340-360`)

### LOW Priority Issues — Backlog

**AUTH-4**: JWT clock skew not explicitly configured (`src/auth/keycloak-jwt.strategy.ts:73-99`)
**AUTH-5**: API key prefix-based lookup timing side-channel (`src/actor/api-key.service.ts:120-145`)
**CRYPTO-1**: bcrypt cost factor 10 (could be 12) (`src/actor/api-key.service.ts:54-57`)
**LOG-8**: Log injection via user input in message strings (multiple files)
**S-1**: Hardcoded PostgreSQL credentials in Docker Compose (`docker-compose.yml:6-8`)
**S-2**: Hardcoded test database credentials (`integration-tests/helpers/db-conn.ts:5-9`)

## Dependency Risk Summary

| Library | Version | Risk | CVEs / Notes | Source | Action Required |
|---------|---------|------|--------------|--------|-----------------|
| @azure-rest/ai-document-intelligence | 1.1.0 | MEDIUM | No CVEs; pinned version | [AI-estimated] | Check for updates |
| @azure/storage-blob | 12.30.0 | MEDIUM | No CVEs; pinned version | [AI-estimated] | Check for updates |
| passport | 0.7.0 | MEDIUM | No CVEs; auth-critical | [AI-estimated] | Monitor |
| passport-jwt | 4.0.1 | MEDIUM | No CVEs; auth-critical | [AI-estimated] | Monitor |
| openid-client | 6.8.2 | MEDIUM | No CVEs; auth-critical | [AI-estimated] | Monitor |
| jwks-rsa | 3.2.0 | MEDIUM | No CVEs; auth-critical | [AI-estimated] | Monitor |
| bcrypt | 6.0.0 | MEDIUM | No CVEs; security-critical | [AI-estimated] | Monitor |

All other 31 dependencies rated LOW risk with 0 CVEs [Trivy].

## Configuration Review Summary

- **Helmet**: Strong — HSTS, CSP, X-Frame-Options, noSniff, Referrer-Policy all configured
- **CORS**: Needs FRONTEND_URL production validation
- **Rate Limiting**: Global 100 req/60s + auth-specific 10 req/min + API key 20 failures/60s
- **Validation**: Global pipe with whitelist + forbidNonWhitelisted + transform
- **Docker**: Non-root user 1001; SSL support for DB connection
- **Missing**: Permissions-Policy header; Swagger auth in production

## Testing Gap Summary

- **Overall**: ~80% source file test coverage; strong auth/RBAC/CSRF testing
- **Critical Gaps**: Upload service (33% coverage), Temporal workers (20% coverage), rate limit enforcement untested
- **Security Tests**: CSRF, auth, RBAC excellent; input validation boundaries and race conditions untested
- **CI/CD**: Unit tests in CI; integration tests manual-only; no coverage threshold enforcement

## Prioritized Remediation Roadmap

### Immediate (This Week)
1. **Rotate hardcoded API key** (`apps/shared/prisma/seed.ts`); remove default; require env var
2. **Add authentication audit events** to `src/auth/auth.controller.ts` (login success/failure, refresh)
3. **Validate FRONTEND_URL** at startup in production mode (`src/main.ts`)

### Short-Term (Next Sprint)
4. **Add authorization failure audit logging** to `identityCanAccessGroup()` and IdentityGuard
5. **Add API key lifecycle audit events** (create, delete, regenerate)
6. **Restrict Swagger UI** to non-production environments
7. **Add audit columns** to DatasetVersion, Split, BenchmarkRun tables
8. **Create input validation boundary test suite** for high-risk endpoints
9. **Add per-API-key rate limiting** or document global throttler protection

### Medium-Term (Next Quarter)
10. **Encrypt SAS URLs at rest** in TrainingJob table
11. **Add Permissions-Policy header** to Helmet configuration
12. **Standardize database naming** to snake_case across schema
13. **Add soft delete** to critical multi-tenant entities
14. **Enable integration tests in CI/CD**
15. **Increase bcrypt cost factor** from 10 to 12
16. **Implement custom validation exception filter** to log validation failures

### Long-Term (Backlog)
17. **Add Temporal mTLS** for backend-to-Temporal authentication
18. **Enable TypeScript strict mode** incrementally
19. **Enforce test coverage thresholds** (80%+) in CI
20. **Implement stack trace sanitization** for production logs
21. **Add concurrent/race condition test suite**

## OWASP Top 10 (2021) Coverage

| Category | Findings | Severity |
|----------|----------|----------|
| A01: Broken Access Control | 3 (DB-2, DB-5, AUTH-3) | HIGH |
| A02: Cryptographic Failures | 3 (DB-1, DB-3, CRYPTO-1) | CRITICAL |
| A03: Injection | 1 (CFG-7 CSP unsafe-inline) | MEDIUM |
| A04: Insecure Design | 2 (AUTH-1, CFG-4) | MEDIUM |
| A05: Security Misconfiguration | 6 (CFG-1 through CFG-8) | HIGH |
| A06: Vulnerable Components | 0 | — |
| A07: Auth Failures | 2 (AUTH-4, AUTH-5) | LOW |
| A08: Software/Data Integrity | 0 | — |
| A09: Logging Failures | 8 (LOG-1 through LOG-8) | CRITICAL |
| A10: SSRF | 0 | — |

THIS ASSESSMENT CONTAINS A CRITICAL VULNERABILITY
