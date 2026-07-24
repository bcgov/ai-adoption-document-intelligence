# Authentication & Authorization Analysis

**Analysis Date**: 2026-04-09
**Scope**: src/auth/ (17 files), src/actor/ (5 files), src/group/ (4 files), src/main.ts, src/app.module.ts

## Authentication Mechanisms

### Primary Authentication
- **Type**: OAuth 2.0 Authorization Code Flow with PKCE
- **Framework**: Passport.js + openid-client (Keycloak OIDC)
- **Implementation**: src/auth/auth.service.ts, src/auth/keycloak-jwt.strategy.ts, src/auth/auth.controller.ts
- **Strength Assessment**: **Strong** — Multi-layer certificate verification, algorithm pinning (RS256 only), issuer/audience validation, nonce binding, PKCE protection

### Secondary Authentication
- **Type**: API Key (static token)
- **Implementation**: src/auth/api-key-auth.guard.ts, src/actor/api-key.service.ts
- **Key Storage**: bcrypt hash (10 rounds), 256-bit CSPRNG generation
- **Strength Assessment**: **Strong** — High-entropy keys, bcrypt hashing, prefix-based indexing, IP-based rate limiting

### Session Management
| Property | Value | Assessment |
|----------|-------|-----------|
| Session ID generation | CSPRNG (openid-client randomState/randomNonce) | Secure |
| Access token lifetime | Keycloak-controlled (default 300s) | Adequate |
| Refresh token lifetime | 30 days, path-scoped to /api/auth/refresh | Adequate |
| HttpOnly cookie | Yes — all auth tokens | Secure |
| Secure cookie | Yes in production; disabled in dev/test | Secure |
| SameSite | Lax for auth cookies; Strict for CSRF token | Secure |
| Fixation prevention | Yes — PKCE state validated | Secure |
| Cookie path scoping | Yes — refresh token scoped to /api/auth/refresh | Secure |

## Authorization Model

### Access Control Summary
- **URL-level**: Present — @Public() decorator bypasses guards; global guard chain enforced
- **Method-level**: Present — @Identity() decorator with requireSystemAdmin, minimumRole, allowApiKey options
- **Data-level**: Present — identityCanAccessGroup() validates group membership before data access

### Role Hierarchy
```
MEMBER (0) < ADMIN (1) < system-admin (global)
```

## Findings

### Finding AUTH-1: API Key Authorization Missing Per-Key Rate Limiting — MEDIUM

**File**: `apps/backend-services/src/auth/api-key-auth.guard.ts`
**Lines**: 81-95
**Evidence**:
```typescript
// File: src/auth/api-key-auth.guard.ts, lines 81-95
const keyInfo = await this.apiKeyService.validateApiKey(apiKey);
if (!keyInfo) {
  this.recordFailedAttempt(clientIp);
  throw new UnauthorizedException("Invalid API key");
}
this.failedAttempts.delete(clientIp); // Reset on success
request.apiKey = keyInfo;
return true;
```
**Analysis**: After successful API key authentication, the failure counter resets and no per-key rate limiting applies. A stolen API key can make unlimited requests. Global throttling (100 req/60s) provides partial mitigation.
**Impact**: Medium — stolen API key has unlimited access rate
**OWASP**: A04:2021 Insecure Design
**CWE**: CWE-770 (Allocation of Resources Without Limits)
**Recommendation**: Add per-API-key rate limiting or document global throttler protection explicitly.

### Finding AUTH-2: API Key Denial Not Logged to Audit Trail — MEDIUM

**File**: `apps/backend-services/src/auth/identity.guard.ts`
**Lines**: 148-157
**Evidence**:
```typescript
// File: src/auth/identity.guard.ts, lines 148-157
if (request.apiKey) {
  if (identityOptions !== undefined) {
    if (!identityOptions.allowApiKey) {
      throw new ForbiddenException("API key authentication is not allowed for this endpoint");
    }
  } else {
    throw new ForbiddenException("API key authentication is not allowed for this endpoint");
  }
}
```
**Analysis**: When API key is presented to an endpoint not allowing API key auth, the guard throws ForbiddenException but does not log to audit trail.
**Impact**: Medium — missing audit trail for API key denial; complicates threat detection
**OWASP**: A09:2021 Logging and Monitoring Failures
**CWE**: CWE-778 (Insufficient Logging)
**Recommendation**: Add logging when API key auth is denied. Ensure logs don't include full API key.

### Finding AUTH-3: Group Authorization Denial Not Audited — MEDIUM

**File**: `apps/backend-services/src/auth/identity.helpers.ts`
**Lines**: 64-102
**Evidence**:
```typescript
// File: src/auth/identity.helpers.ts, lines 64-102
export function identityCanAccessGroup(
  identity: ResolvedIdentity | undefined,
  groupId: string | null,
  minimumRole: GroupRole = GroupRole.MEMBER,
): void {
  if (!identity) {
    throw new ForbiddenException("User does not belong to requested group.");
  }
  if (!Object.hasOwn(identity.groupRoles, groupId)) {
    throw new ForbiddenException("User does not belong to requested group.");
  }
}
```
**Analysis**: Authorization denials throw ForbiddenException without logging. Cannot detect enumeration attacks or unauthorized access patterns.
**Impact**: Medium — missing audit trail for authorization failures
**OWASP**: A09:2021 Logging and Monitoring Failures
**CWE**: CWE-778 (Insufficient Logging)
**Recommendation**: Add audit event recording for denied group access attempts.

### Finding AUTH-4: JWT Clock Skew Not Explicitly Configured — LOW

**File**: `apps/backend-services/src/auth/keycloak-jwt.strategy.ts`
**Lines**: 73-99
**Evidence**:
```typescript
// File: src/auth/keycloak-jwt.strategy.ts, lines 73-99
super({
  secretOrKeyProvider: passportJwtSecret({ ... }),
  jwtFromRequest: cookieOrBearerExtractor,
  issuer: expectedIssuer,
  audience: clientId,
  algorithms: ["RS256"],
  // No clockTimestamp or clockTolerance configured
});
```
**Analysis**: No explicit clock skew tolerance configured. Default allows 0-60 seconds. Short-lived tokens (5 min) mitigate the risk.
**Impact**: Low — short-lived tokens mitigate; NTP-synchronized production clocks expected
**OWASP**: A07:2021 Identification and Authentication Failures
**CWE**: CWE-613 (Insufficient Session Expiration)
**Recommendation**: Consider explicitly setting clock skew tolerance (e.g., 30 seconds).

### Finding AUTH-5: API Key Prefix-Based Lookup Timing Side-Channel — LOW

**File**: `apps/backend-services/src/actor/api-key.service.ts`
**Lines**: 120-145
**Evidence**:
```typescript
// File: src/actor/api-key.service.ts, lines 120-145
async validateApiKey(key: string): Promise<ValidatedApiKey | null> {
  const prefix = key.substring(0, 8);
  const apiKeys = await this.apiKeyDb.findApiKeysByPrefix(prefix);
  for (const apiKey of apiKeys) {
    const isValid = await bcrypt.compare(key, apiKey.key_hash);
    if (isValid) { ... }
  }
  return null;
}
```
**Analysis**: Prefix lookup enables minor timing side-channel for enumerating valid prefixes. bcrypt.compare is timing-safe for the actual hash comparison.
**Impact**: Low — prefix enumeration is low-impact; actual key hash protected by bcrypt
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-208 (Observable Timing Discrepancy)
**Recommendation**: Optional — consider constant-time prefix lookup.

## Positive Security Observations

1. **OIDC/PKCE Framework**: Credential handling delegated to Keycloak; no local password storage
2. **RS256 Algorithm Pinning**: Prevents HS256 algorithm-confusion attacks
3. **HttpOnly Cookies**: All sensitive tokens are HttpOnly; XSS cannot steal tokens
4. **Path-Scoped Cookies**: Refresh token scoped to /api/auth/refresh
5. **Double-Submit CSRF**: 256-bit CSPRNG token with SameSite=strict
6. **Issuer/Audience Validation**: JWT validated for both issuer and audience claims
7. **JWKS Key Rotation**: jwks-rsa automatically fetches fresh public keys
8. **IP-Based Rate Limiting**: 20 failed API key attempts per 60 seconds triggers 429
9. **Helmet Security Headers**: CSP, HSTS, X-Frame-Options, Referrer-Policy
10. **Global Rate Limiting**: ThrottlerGuard enforces 100 req/60s per IP
11. **Auth-Specific Rate Limiting**: Login/callback at 10 req/min; refresh at 5 req/min
12. **CORS Configured**: Only FRONTEND_URL origin allowed with credentials
