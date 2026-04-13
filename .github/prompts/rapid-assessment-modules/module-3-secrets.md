# Module 3: Secrets Analysis

**Output**: `findings/security/secrets-analysis.md`
**Time estimate**: 15-30 minutes

## Objective

Search for hardcoded secrets, credentials, API keys, and sensitive data across ALL file types. Classify each finding by severity and distinguish production secrets from development placeholders.

## Search Patterns

Apply these patterns across source, config, properties, XML, YAML, JSON, scripts, and environment files:

| Category | Patterns |
|----------|---------|
| Passwords | `password`, `passwd`, `pwd`, `pass` (in assignments/config values) |
| API keys | `api_key`, `apikey`, `api-key`, `secret_key`, `secretkey` |
| Tokens | `token`, `auth_token`, `access_token`, `bearer`, `jwt` |
| Connection strings | `jdbc:`, `mongodb://`, `redis://`, `amqp://`, `mysql://`, `postgres://` |
| Credentials | `credential`, `username.*=`, `user.*=.*password` |
| Cloud keys | `AKIA` (AWS), `aws_secret`, `aws_access`, `GOOG`, `azure` |
| Private keys | `BEGIN RSA PRIVATE KEY`, `BEGIN PRIVATE KEY`, `BEGIN EC PRIVATE KEY` |
| Generic secrets | `secret`, `encryption_key`, `signing_key`, `private_key` |

Use `search/textSearch` with these patterns. Read the surrounding context (5-10 lines) for each match to assess the finding.

## Classification Criteria

| Severity | Criteria | Examples |
|----------|----------|---------|
| **CRITICAL** | Production credentials, private keys, API keys with external system access | Actual passwords in config, private key files, cloud access keys |
| **HIGH** | Database passwords, service account credentials in source control | JDBC URLs with embedded passwords, LDAP bind credentials |
| **MEDIUM** | Development/test credentials that follow production patterns | Credentials in dev config that could be copy-pasted to production |
| **LOW** | Placeholder values, example credentials clearly marked | `password=changeme`, `TODO: replace with real key` |
| **INFORMATIONAL** | Configuration that loads secrets from environment variables | `password=${DB_PASSWORD}`, `System.getenv("API_KEY")` — this is GOOD practice |

## False Positive Prevention

- Do NOT flag environment variable references as secrets — these are the correct pattern
- Do NOT flag password field names in HTML forms (these are UI labels, not secrets)
- Do NOT flag hashed passwords (bcrypt, SHA-256 hashes) — these are already protected
- Do NOT flag test fixture data clearly in test directories
- DO flag connection strings even if they appear to be "dev" — they may be reused

## Required Output Format

```markdown
# Secrets Analysis

**Analysis Date**: [date]
**Scope**: [files/directories scanned]
**Total Findings**: [count]

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | X |
| HIGH | X |
| MEDIUM | X |
| LOW | X |
| INFORMATIONAL | X |

## Findings

### Finding S-[N]: [Title] — [SEVERITY]

**File**: [exact path]
**Line(s)**: [line numbers]
**Evidence**:
```[language]
// File: [path], line [N]
[code showing the secret — REDACT actual values with asterisks for real secrets]
```
**Classification**: [Production credential / Development placeholder / Environment reference / Test fixture]
**Risk**: [Why this is or isn't a real risk — specific technical reasoning]
**Recommendation**: [Specific remediation — e.g., "Move to environment variable", "Use vault", "Rotate this credential immediately"]
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-798 (Hard-coded Credentials) / CWE-312 (Cleartext Storage)

[Repeat for each finding]

## Positive Security Observations

[List any good practices found — e.g., "Application uses environment variables for database credentials in production configuration"]
```
