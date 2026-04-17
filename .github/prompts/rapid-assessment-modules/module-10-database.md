# Module 10: Database Script Analysis

**Output**: `findings/security/database-analysis.md`
**Time estimate**: 10-20 minutes

## Objective

Scan SQL scripts, migration files, stored procedures, seed/install scripts, and database configuration for security issues. This module targets vulnerabilities that live in database-layer artifacts (`.sql` files, migration directories), not application-level SQL injection (which Module 4 covers).

## File Discovery

Use `search/fileSearch` to find all database-related files:
- `**/*.sql`
- `**/migrations/**`
- `**/db/**`
- `**/schema/**`
- `**/seeds/**`, `**/fixtures/**`
- `**/flyway/**`, `**/liquibase/**`
- `**/stored-procedures/**`, `**/sprocs/**`

## Analysis Areas

### 10a. Dynamic SQL in Stored Procedures

Search for string concatenation inside dynamic SQL execution — these are injection vectors at the database layer:

| Pattern | Risk |
|---------|------|
| `EXECUTE IMMEDIATE` with `\|\|` concatenation | HIGH — Oracle dynamic SQL injection |
| `sp_executesql` with `+` or string variables | HIGH — SQL Server dynamic SQL injection |
| `EXEC(` with string concatenation | HIGH — SQL Server dynamic execution |
| `PREPARE` + `EXECUTE` with concat in MySQL/PostgreSQL | HIGH — Prepared dynamic SQL |
| `DBMS_SQL.PARSE` with concatenated strings | HIGH — Oracle dynamic SQL |
| `FORMAT()` or `string_agg()` building SQL | MEDIUM — PostgreSQL dynamic SQL |

**Not a finding**: Parameterized `sp_executesql` with `@param` placeholders, or `EXECUTE IMMEDIATE` with bind variables using `USING` clause.

### 10b. Permission and Grant Analysis

| Pattern | Risk |
|---------|------|
| `GRANT ALL` or `GRANT ALL PRIVILEGES` | HIGH — Overly broad permissions |
| `GRANT ... WITH GRANT OPTION` | MEDIUM — Permission escalation chain |
| `GRANT ... TO PUBLIC` | HIGH — Universal access |
| `ALTER USER ... SUPERUSER` | CRITICAL — Superuser escalation |
| `GRANT DBA TO` | CRITICAL — DBA role assignment |
| Missing `REVOKE` after temporary grants | MEDIUM — Lingering permissions |

**Not a finding**: Scoped grants like `GRANT SELECT ON specific_table TO specific_role`.

### 10c. Credentials in Database Scripts

Search for hardcoded credentials in install, seed, and migration scripts:

- `CREATE USER ... IDENTIFIED BY '[password]'`
- `CREATE LOGIN ... WITH PASSWORD = '[password]'`
- `ALTER USER ... PASSWORD '[password]'`
- `INSERT INTO users ... VALUES (... 'password' ...)`
- Default well-known passwords: `admin`, `password`, `changeme`, `test123`, `root`

**Not a finding**: Placeholder values clearly marked (e.g., `-- TODO: replace`, `'${DB_PASSWORD}'`).

### 10d. Row-Level Security and Access Controls

Check for:
- Tables with sensitive data (users, credentials, PII, financial) that lack row-level security policies
- Missing `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on multi-tenant tables
- Views without `WHERE` clauses that could expose cross-tenant data
- Missing audit columns (`created_by`, `modified_by`) on sensitive tables

### 10e. Schema Security

- Default schema names used for sensitive data (`dbo`, `public`)
- Tables with no explicit owner
- Sequences or auto-increment columns exposed without access control
- Triggers with `EXECUTE AS OWNER` or `SECURITY DEFINER` without justification

### 10f. Data Exposure in Seed/Fixture Scripts

- Real PII, email addresses, or production data in seed scripts
- Realistic-looking test data that could be actual data (check for patterns like real email domains, phone number formats)

## Search Patterns

```
# Dynamic SQL
EXECUTE IMMEDIATE|sp_executesql|EXEC\(|DBMS_SQL|PREPARE.*EXECUTE

# Permissions
GRANT ALL|GRANT.*TO PUBLIC|WITH GRANT OPTION|SUPERUSER|GRANT DBA

# Credentials in scripts
IDENTIFIED BY|WITH PASSWORD|CREATE LOGIN|CREATE USER.*PASSWORD|INSERT INTO.*user.*password

# Row-level security
ROW LEVEL SECURITY|ENABLE RLS|CREATE POLICY|FORCE ROW LEVEL
```

## Required Output Format

```markdown
# Database Script Analysis

**Analysis Date**: [date]
**Scope**: [count] SQL files, [count] migration files examined
**Database Type**: [Oracle/PostgreSQL/MySQL/SQL Server/SQLite — detected from SQL dialect]

## Files Examined

| File Path | Type | Lines |
|-----------|------|-------|
| [path] | [migration/seed/stored proc/schema] | [count] |

## Summary

| Category | Findings | Highest Severity |
|----------|----------|-----------------|
| Dynamic SQL Injection | X | [severity] |
| Permission/Grant Issues | X | [severity] |
| Hardcoded Credentials | X | [severity] |
| Row-Level Security Gaps | X | [severity] |
| Schema Security | X | [severity] |
| Data Exposure in Seeds | X | [severity] |

## Findings

### Finding DB-[N]: [Title] — [SEVERITY]

**File**: [exact path]
**Lines**: [range]
**Evidence**:
```sql
-- File: [path], lines [range]
[SQL code snippet]
```
**Analysis**: [why this is a database security issue]
**Impact**: [what could happen — data breach, privilege escalation, injection]
**OWASP**: [A01/A03/A04/A05 as appropriate]
**CWE**: [CWE-NNN — e.g., CWE-89 SQL Injection, CWE-732 Incorrect Permission, CWE-798 Hard-coded Credentials]
**Recommendation**: [specific fix with SQL example]

## Categories With No Findings

[List categories scanned with no issues, noting what was checked]

## Positive Observations

[Good database security practices found — e.g., "All migrations use parameterized dynamic SQL", "Row-level security enabled on tenant tables"]
```
