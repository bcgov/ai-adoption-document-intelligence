# Testing Gap Analysis

**Analysis Date**: 2026-04-09
**Scope**: apps/backend-services/src/, integration-tests/

## Test Infrastructure Summary

| Property | Value |
|----------|-------|
| Test framework(s) | Jest 30.2.0, @nestjs/testing 11.1.9, Supertest 7.1.4 |
| Test directory | src/ (co-located *.spec.ts), integration-tests/ |
| Total test files | 99 (unit) + 8 (integration) |
| Total source files | 140 (non-test, non-DTO) + 91 (DTOs) |
| Test:Source ratio | ~1:1.4 for source files |
| Coverage tool | Jest --coverage (configured) |
| CI/CD | GitHub Actions (backend-qa.yml) |

## Test Coverage by Component

| Component | Source Files | Test Files | Coverage Assessment |
|-----------|------------|-----------|-------------------|
| auth/ | 21 | 13 | **Good** — Guards, controllers, helpers covered |
| actor/ | 4 | 4 | **Good** — Full coverage |
| document/ | 3 | 3 | **Good** — Full coverage |
| azure/ | 5 | 5 | **Good** — Full coverage |
| benchmark/ | 37 | 27 | **Fair** — 72% file coverage |
| hitl/ | 6 | 5 | **Good** — Missing tool-manifest tests |
| template-model/ | 7 | 7 | **Good** — Full coverage incl. integration |
| workflow/ | 7 | 7 | **Good** — Full coverage |
| training/ | 5 | 4 | **Fair** — Missing poller depth |
| upload/ | 3 | 1 | **Poor** — 33% coverage |
| group/ | 4 | 3 | **Good** — Full coverage |
| ocr/ | 4 | 2 | **Fair** — 50% coverage |
| logging/ | 4 | 3 | **Good** — Full coverage |
| metrics/ | 4 | 3 | **Good** — Full coverage |
| database/ | 2 | 1 | **Good** — Core covered |
| queue/ | 2 | 1 | **Good** — Service covered |
| confusion-profile/ | 2 | 1 | **Poor** — Controller untested |
| temporal/ | 5 | 1 | **Poor** — 20% coverage |
| bootstrap/ | 2 | 1 | **Poor** — Controller untested |
| blob-storage/ | 4 | 3 | **Good** — Full coverage |
| audit/ | 3 | 2 | **Good** — Full coverage |

## Security Test Assessment

| Security Area | Tests Exist? | Quality | Notes |
|---------------|-------------|---------|-------|
| CSRF Protection | Yes | Excellent | csrf.guard.spec.ts: 8 test cases |
| Authentication | Yes | Excellent | auth.controller, jwt-auth, api-key guards |
| Authorization (RBAC) | Yes | Excellent | identity.guard.spec.ts: 19+ cases |
| Rate Limiting | Partial | Fair | Metadata-only validation; no 429 stress tests |
| Input Validation | Partial | Fair | DTOs use class-validator but no boundary/injection tests |
| Error Handling | Yes | Good | Controllers test error propagation |
| SQL Injection | Unknown | Untested | Prisma mitigates but no explicit tests |
| Concurrent Requests | No | Untested | No race condition tests |

## CI/CD Pipeline Assessment

| Stage | Present? | Configuration |
|-------|----------|--------------|
| Build automation | Yes | nest build via SWC |
| Linting | Yes | Biome 2.4.8 (pre-commit via lefthook + CI) |
| Type checking | Yes | tsc --noEmit in CI |
| Unit test execution | Yes | jest --coverage in backend-qa.yml |
| Integration tests | No (CI) | Manual only: npm run test:int |
| Security scanning | Partial | CodeQL runs on push/PR (not backend-specific) |
| Dependency check | Yes | dependency-review action |
| Coverage reporting | No | Artifacts not published; threshold not enforced |

## Critical Testing Gaps

### Gap TEST-1: Upload Module Service Logic Untested — HIGH

**Component**: upload/
**Missing**: Unit tests for upload service business logic
**Risk**: File upload, storage integration, workflow triggering bugs undetected
**Files at Risk**: src/upload/upload.controller.ts
**Recommendation**: Create upload.service.spec.ts covering file upload, validation, storage, and workflow dispatch.

### Gap TEST-2: Temporal Workflow Activity/Worker Tests Missing — HIGH

**Component**: temporal/
**Missing**: Workflow activity handlers, worker retry logic, error recovery
**Risk**: Workflow failures, retry storms, infinite loops in production
**Files at Risk**: src/temporal/ (5 source files, only 1 spec)
**Recommendation**: Create workflow activity tests with mocked Temporal client.

### Gap TEST-3: Untested Controllers — MEDIUM

**Component**: confusion-profile/, bootstrap/
**Missing**: Controller spec files
**Risk**: Request validation, authorization bypass undetected
**Files at Risk**: confusion-profile.controller.ts, bootstrap.controller.ts
**Recommendation**: Add controller spec files with auth/validation tests.

### Gap TEST-4: No Rate Limiting Enforcement Tests — MEDIUM

**Component**: auth/
**Missing**: Actual HTTP 429 response tests under load
**Risk**: Rate limiting may not function as expected; brute force unprotected
**Files at Risk**: src/auth/throttle.spec.ts (metadata-only)
**Recommendation**: Add Supertest-based tests exceeding rate limit to verify 429 responses.

### Gap TEST-5: No Input Boundary/Injection Tests — MEDIUM

**Component**: All modules with DTOs
**Missing**: Boundary values, injection payloads, oversized bodies
**Risk**: Validation bypasses for injection, DoS attacks
**Files at Risk**: All DTO files
**Recommendation**: Create security payload test utility with SQL injection, XSS, path traversal patterns.

### Gap TEST-6: No Concurrent Request Tests — MEDIUM

**Component**: group/, document/, hitl/
**Missing**: Race condition tests for concurrent mutations
**Risk**: Data corruption, lost updates, inconsistent state
**Files at Risk**: Group membership, document state, HITL review mutations
**Recommendation**: Create concurrent test helper; test 3 critical scenarios.

### Gap TEST-7: Integration Tests Not in CI/CD — MEDIUM

**Component**: CI pipeline
**Missing**: integration-tests/ not executed in GitHub Actions
**Risk**: DB constraint violations, service integration failures only found post-merge
**Files at Risk**: integration-tests/*.spec.ts
**Recommendation**: Add test:int to backend-qa.yml workflow.

## Recommendations

### Immediate (High-value, low-effort tests to add first)
1. Create upload.service.spec.ts (core upload logic)
2. Add rate-limit stress tests to throttle.spec.ts (verify 429 responses)
3. Add controller specs for confusion-profile and bootstrap

### Short-Term
4. Create Temporal workflow activity tests
5. Implement input boundary/injection test suite
6. Add concurrent request test scenarios
7. Enable integration tests in CI/CD

### Long-Term
8. Enforce coverage thresholds (80%+) in CI
9. Create OWASP Top 10 test checklist
10. Database constraint violation test suite
