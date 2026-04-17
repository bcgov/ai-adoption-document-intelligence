# Module 5: Authentication & Authorization Analysis

**Output**: `findings/security/authentication-analysis.md`
**Time estimate**: 15-20 minutes

## Objective

Analyze all authentication mechanisms, session management, authorization models, and access control enforcement. Identify weaknesses in identity and access management.

## Analysis Areas

### 5a. Authentication Mechanisms

- What authentication methods are used? (form-based, SSO, token, certificate, basic auth)
- Framework-specific auth: Spring Security, ASP.NET Identity, Passport.js, Django auth, Devise, Shiro, etc.
- Custom auth implementations (often more vulnerable than framework auth)
- Multi-factor authentication presence/absence

### 5b. Session Management

- Session creation and destruction
- Session ID generation (predictable vs. cryptographically random)
- Session timeout configuration
- Session fixation prevention (ID regeneration after login)
- Cookie flags: `HttpOnly`, `Secure`, `SameSite`
- Concurrent session controls

### 5c. Authorization Model

- Role-based access control (RBAC) implementation
- URL-level access control (web.xml security-constraints, route middleware)
- Method-level authorization (@PreAuthorize, [Authorize], decorators)
- Data-level authorization (can user X access record Y?)
- Admin endpoint protection
- API authorization (token scopes, API keys)

### 5d. Password Security

- Password storage (hashing algorithm: bcrypt/scrypt/argon2 vs. MD5/SHA1)
- Salt usage
- Password complexity requirements
- Password reset mechanism security

### 5e. Service-to-Service Authentication

- How internal services authenticate to each other
- Shared secrets, mutual TLS, service tokens
- External API authentication (API keys, OAuth)

## Search Patterns

Use `search/textSearch` with these patterns to locate relevant code:
- `login|logout|authenticate|authorize|session|cookie|token|credential|password|role|permission|access`
- `HttpSession|getSession|setAttribute|SecurityContext|Principal`
- `@PreAuthorize|@Secured|@RolesAllowed|[Authorize]|@login_required`
- `web.xml.*security-constraint|security-role|auth-constraint`
- `BCrypt|PBKDF2|scrypt|argon2|MessageDigest|SHA|MD5` (password hashing)

## Required Output Format

```markdown
# Authentication & Authorization Analysis

**Analysis Date**: [date]
**Scope**: [files examined]

## Authentication Mechanisms

### Primary Authentication
- **Type**: [form-based / SSO / token / etc.]
- **Framework**: [specific framework if used]
- **Implementation**: [file paths of auth code]
- **Strength Assessment**: [Strong / Adequate / Weak — with reasoning]

### Session Management
| Property | Value | Assessment |
|----------|-------|-----------|
| Session ID generation | [method] | [Secure/Insecure] |
| Session timeout | [value] | [Adequate/Too long] |
| HttpOnly cookie | [Yes/No] | [Secure/Insecure] |
| Secure cookie | [Yes/No] | [Secure/Insecure] |
| SameSite | [value] | [Secure/Insecure] |
| Fixation prevention | [Yes/No] | [Secure/Insecure] |

## Authorization Model

### Access Control Summary
- **URL-level**: [Present/Absent — details]
- **Method-level**: [Present/Absent — details]
- **Data-level**: [Present/Absent — details]

## Findings

### Finding AUTH-[N]: [Title] — [SEVERITY]

**File**: [exact path]
**Lines**: [range]
**Evidence**:
```[language]
[code snippet]
```
**Analysis**: [technical explanation]
**Impact**: [what an attacker could do]
**OWASP**: A01:2021 Broken Access Control / A07:2021 Identification and Authentication Failures
**CWE**: [CWE-NNN]
**Recommendation**: [specific fix]

## Positive Security Observations

[List good practices found — e.g., "Application uses centralized SSO for authentication"]
```
