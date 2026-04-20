# Secrets Analysis

**Analysis Date**: 2026-04-09
**Scope**: All source, config, test, and deployment files in apps/backend-services
**Total Findings**: 5
**Trivy Secrets Scan**: 0 secrets detected

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 1 |
| LOW | 2 |
| INFORMATIONAL | 0 |

## Findings

### Finding S-1: Hardcoded PostgreSQL Credentials in Docker Compose — HIGH

**File**: `apps/backend-services/docker-compose.yml`
**Line(s)**: 6-8
**Evidence**:
```yaml
# File: apps/backend-services/docker-compose.yml, lines 6-8
environment:
  POSTGRES_DB: ai_doc_intelligence
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: postgres
```
**Classification**: Development placeholder
**Risk**: Default/weak credentials (`postgres:postgres`) in Docker Compose. While this is a local development compose file and port 5432 is exposed only to localhost, it sets a weak-credential pattern. The password is trivially guessable.
**Recommendation**: Extract credentials to `.env` file with environment variable substitution. Use stronger passwords even for development.
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-798 (Hard-coded Credentials), CWE-1391 (Weak Credentials)

### Finding S-2: Hardcoded Test Database Credentials — HIGH

**File**: `apps/backend-services/integration-tests/helpers/db-conn.ts`
**Line(s)**: 5-9
**Evidence**:
```typescript
// File: apps/backend-services/integration-tests/helpers/db-conn.ts, lines 5-9
const POSTGRES_USER = "testuser";
const POSTGRES_PASSWORD = "testpass";
const POSTGRES_DB = "testdb";
const PORT = 5555;
const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}?schema=public`;
```
**Also in**: `apps/backend-services/integration-tests/run.sh` (lines 6-7)
**Classification**: Test fixture
**Risk**: Test-only credentials hardcoded in source. Intentionally weak for test isolation, but establishes pattern that could be copy-pasted to production.
**Recommendation**: Extract to `.env.test` or environment variables.
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-798 (Hard-coded Credentials)

### Finding S-3: Default MinIO Credentials with Fallback — MEDIUM

**File**: `apps/backend-services/docker-compose.yml`
**Line(s)**: 27-28
**Evidence**:
```yaml
# File: apps/backend-services/docker-compose.yml, lines 27-28
MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
```
**Classification**: Development placeholder with environment variable override
**Risk**: Default MinIO credentials (`minioadmin:minioadmin`) as fallback. Mitigated by environment variable override mechanism and localhost-only exposure.
**Recommendation**: Document that production deployments must override these values.
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-1391 (Weak Credentials)

### Finding S-4: Azure Storage Connection String in Test Fixture — LOW

**File**: `apps/backend-services/src/blob-storage/azure-storage.service.spec.ts`
**Line(s)**: 72-73
**Evidence**:
```typescript
// File: src/blob-storage/azure-storage.service.spec.ts, lines 72-73
const validConfig = {
  AZURE_STORAGE_CONNECTION_STRING:
    "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key==;EndpointSuffix=core.windows.net",
};
```
**Classification**: Test fixture with obviously fake credentials
**Risk**: No risk — test fixture only with non-functional credential values.
**Recommendation**: No action required.
**OWASP**: N/A
**CWE**: N/A

### Finding S-5: Mock API Key in Test Fixture — LOW

**File**: `apps/backend-services/src/azure/azure.service.spec.ts`
**Line(s)**: 16
**Evidence**:
```typescript
// File: src/azure/azure.service.spec.ts, line 16
if (key === "AZURE_DOCUMENT_INTELLIGENCE_API_KEY") return "secret-key";
```
**Classification**: Test fixture with placeholder value
**Risk**: No risk — test mock, not called in production.
**Recommendation**: No action required.
**OWASP**: N/A
**CWE**: N/A

## Positive Security Observations

1. **API Keys Properly Hashed with Bcrypt**: API keys are never stored in plaintext. Bcrypt with 10 rounds is used (src/actor/api-key.service.ts). Only key prefix stored for UI display.
2. **Environment Variables Used Throughout**: All sensitive configuration properly uses `ConfigService` dependency injection. No hardcoded production credentials in source code.
3. **`.env` Files Gitignored**: Production environment files excluded from version control.
4. **Test Fixture Isolation**: All test credentials confined to `*.spec.ts` files with mock ConfigService.
5. **Dockerfile Uses No Secrets**: Build process does not embed credentials.
