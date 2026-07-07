# Database Script Analysis

**Analysis Date**: 2026-04-09
**Scope**: 1 Prisma schema (769 lines), 8 SQL migration files, seed file, database utilities
**Database Type**: PostgreSQL (via Prisma ORM 7.2.0)

## Files Examined

| File Path | Type | Lines |
|-----------|------|-------|
| apps/shared/prisma/schema.prisma | Prisma Schema | 769 |
| apps/shared/prisma/migrations/20260328205045_init/migration.sql | SQL Migration | ~800 |
| apps/shared/prisma/migrations/20260402000000_workflow_versions/migration.sql | SQL Migration | ~280 |
| apps/shared/prisma/migrations/20260402000001_add_document_locks/migration.sql | SQL Migration | 23 |
| apps/shared/prisma/migrations/20260404051254_add_pipeline_debug_log/migration.sql | SQL Migration | 2 |
| apps/shared/prisma/migrations/20260405063655_add_format_spec_column/migration.sql | SQL Migration | 2 |
| apps/shared/prisma/migrations/20260405083710_remove_confusion_profile_scope/migration.sql | SQL Migration | 5 |
| apps/shared/prisma/migrations/20260405074749_add_confusion_profiles/migration.sql | SQL Migration | 20 |
| apps/shared/prisma/migrations/20260407012235_add_ground_truth_workflow_overrides/migration.sql | SQL Migration | 2 |
| apps/shared/prisma/seed.ts | TypeScript Seed | ~1,500 |
| apps/backend-services/src/database/prisma.service.ts | Database Service | 95 |
| apps/backend-services/src/utils/database-url.ts | DB URL Config | 48 |
| apps/backend-services/prisma.config.ts | Prisma Config | 23 |

## Summary

| Category | Findings | Highest Severity |
|----------|----------|-----------------|
| Hardcoded Credentials | 1 | CRITICAL |
| Audit Trail Gaps | 1 | HIGH |
| Encryption at Rest | 1 | HIGH |
| Naming Consistency | 1 | MEDIUM |
| Soft Delete Gaps | 1 | MEDIUM |
| SQL Injection (raw queries) | 0 | — |
| Permission/Grant Issues | 0 | — |

## Findings

### Finding DB-1: Hardcoded Test API Key in Seed File — CRITICAL

**File**: `apps/shared/prisma/seed.ts`
**Lines**: 1406-1426
**Evidence**:
```typescript
// File: apps/shared/prisma/seed.ts, lines 1406-1426
async function seedTestApiKey() {
  const TEST_API_KEY = process.env.TEST_API_KEY || "69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY";
  const keyPrefix = TEST_API_KEY.substring(0, 8);
  const keyHash = await bcrypt.hash(TEST_API_KEY, 10);
  await prisma.apiKey.upsert({
    where: { key_hash: keyHash },
    update: { key_prefix: keyPrefix, generating_user_id: "test-user" },
    create: { generating_user_id: "test-user", key_hash: keyHash, key_prefix: keyPrefix, group_id: SEED_GROUP_ID },
  });
}
```
**Also found in**: `playwright.config.ts` (line 8)
**Analysis**: Hardcoded API key in source code, visible in commit history. Any person with repository access can authenticate as the test user. The key is functionally valid for authenticating against the API.
**Impact**: Unauthorized API access using known key; data exfiltration from associated group
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-798 (Hard-coded Credentials)
**Recommendation**: 1) Rotate/invalidate the exposed key immediately. 2) Remove hardcoded default; require TEST_API_KEY env var. 3) Add git-secrets or pre-commit hooks. 4) Audit authentication attempts using this key.

### Finding DB-2: Missing Audit Columns on Multi-Tenant Tables — HIGH

**File**: `apps/shared/prisma/schema.prisma`
**Lines**: Various (DatasetVersion, Split, BenchmarkRun, BenchmarkOcrCache models)
**Evidence**:
```prisma
-- File: apps/shared/prisma/schema.prisma
model DatasetVersion {
  id            String   @id @default(uuid())
  datasetId     String
  version       String
  createdAt     DateTime @default(now())
  // MISSING: created_by, updated_by, updated_at, deleted_at
  @@map("dataset_versions")
}
```
**Analysis**: Multiple multi-tenant tables lack audit columns (created_by, updated_by, updated_at, deleted_at). Cannot track who modified datasets, benchmarks, or training runs. Schema TODO comments acknowledge this issue.
**Impact**: No forensic capability for security incidents on these tables; compliance violations
**OWASP**: A01:2021 Broken Access Control
**CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key)
**Recommendation**: Add audit columns to all multi-tenant tables. Create migration to backfill existing records.

### Finding DB-3: Unencrypted SAS URL Storage — HIGH

**File**: `apps/shared/prisma/schema.prisma`
**Lines**: ~262
**Evidence**:
```prisma
-- File: apps/shared/prisma/schema.prisma, line ~262
model TrainingJob {
  id             String @id @default(cuid())
  sas_url        String?  -- SAS URL stored in plaintext
  @@map("training_jobs")
}
```
**Analysis**: Azure SAS (Shared Access Signature) URLs stored in plaintext in the database. These URLs are temporary credentials granting access to Azure Blob Storage. Anyone with database access can use them.
**Impact**: Unauthorized blob storage access via stored SAS URLs; database backup exposure includes valid credentials
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-312 (Cleartext Storage of Sensitive Information)
**Recommendation**: Encrypt SAS URLs at rest using application-level encryption. Consider Azure Key Vault. Add expiration tracking.

### Finding DB-4: Inconsistent Database Naming Conventions — MEDIUM

**File**: `apps/shared/prisma/schema.prisma`
**Lines**: 5-6 (TODO comments)
**Evidence**:
```prisma
-- File: apps/shared/prisma/schema.prisma, lines 5-6
// TODO: Standardize created_by/creator and updated_by/updator columns.
// TODO: Standardize case formatting. Decide between snake_case or camelCase.
```
**Analysis**: Mix of snake_case (`created_at`, `updated_at`) and camelCase (`createdAt`, `updatedAt`) across schema. Different column names for same concept across tables.
**Impact**: Increased defect rate, maintenance complexity, developer confusion
**OWASP**: N/A (Code Quality)
**CWE**: CWE-1104 (Use of Unmaintained Third Party Components)
**Recommendation**: Standardize on snake_case (BC Gov recommendation). Create migration plan.

### Finding DB-5: No Soft Delete on Critical Records — MEDIUM

**File**: `apps/shared/prisma/schema.prisma`
**Lines**: 340-360
**Evidence**:
```prisma
-- File: apps/shared/prisma/schema.prisma
model Group {
  deleted_at  DateTime?  -- Only Group has soft delete
  deleted_by  String?
}

model Dataset {
  -- No soft delete tracking
}

model BenchmarkProject {
  -- No soft delete tracking
}
```
**Analysis**: Only `Group` model has soft delete support. Critical entities (Dataset, BenchmarkProject, TemplateModel) use hard deletes. Historical data destroyed on deletion.
**Impact**: Data loss on accidental deletion; no deletion audit trail for most entities
**OWASP**: A01:2021 Broken Access Control
**CWE**: CWE-639 (Authorization Bypass Through User-Controlled Key)
**Recommendation**: Add soft delete columns to critical entities. Change cascade deletes to set soft delete flag.

## Categories With No Findings

### SQL Injection Prevention — ✅ PASS
No instances of `$queryRaw`, `$queryRawUnsafe`, `$executeRaw`, or `$executeRawUnsafe` in application code. All database operations use Prisma ORM parameterized queries.

### Database Permissions — ✅ PASS
No overly permissive GRANT ALL statements in migrations. Foreign key constraints properly configured. Cascading deletes strategically applied.

### Sensitive Data Logging — ✅ PASS
Database connection strings log only host/database without credentials.

## Positive Observations

1. **Prisma ORM**: All queries parameterized; no SQL injection vectors
2. **API Key Hashing**: bcrypt with cost factor 10 for key storage
3. **Secure Random Generation**: `crypto.randomBytes(32)` for key generation
4. **Proper Transaction Handling**: `$transaction` used for multi-step operations
5. **Comprehensive Foreign Keys**: Referential integrity maintained
6. **Database URL Parsing**: No credential logging in URL construction
7. **Group Model**: Exemplary audit column implementation (created_by, updated_by, deleted_at, deleted_by)
