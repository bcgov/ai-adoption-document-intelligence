# Cryptographic Analysis

**Analysis Date**: 2026-04-09
**Scope**: All source files in apps/backend-services/src/

## Cryptographic Inventory

| Usage | Algorithm | Location | Assessment |
|-------|-----------|----------|-----------|
| API Key Hashing | bcrypt (10 rounds) | src/actor/api-key.service.ts:57 | ✅ Strong |
| JWT Signature | RS256 (RSA-2048 + SHA-256) | src/auth/keycloak-jwt.strategy.ts:93 | ✅ Strong |
| JWKS Key Fetching | JWKS with rate limiting | src/auth/keycloak-jwt.strategy.ts:77-85 | ✅ Strong |
| Config Integrity | SHA-256 | src/workflow/config-hash.ts:19 | ✅ Strong |
| CSRF Token | randomBytes (256-bit) | src/auth/cookie-auth.utils.ts:121 | ✅ Strong |
| Request ID | UUID v4 (crypto) | src/logging/logging.middleware.ts:15 | ✅ Strong |
| PKCE Code Challenge | S256 (SHA-256) | src/auth/auth.service.ts:100 | ✅ Strong |
| Evaluator Config Hash | SHA-256 | src/benchmark/benchmark-run.service.ts:358 | ✅ Strong |

## Findings

No cryptographic vulnerabilities found. All implementations follow current best practices.

### Finding CRYPTO-1: bcrypt Cost Factor 10 (Acceptable, Could Be Higher) — LOW

**File**: `apps/backend-services/src/actor/api-key.service.ts`
**Lines**: 54-57
**Evidence**:
```typescript
// File: src/actor/api-key.service.ts, lines 54-57
const key = crypto.randomBytes(32).toString("base64url");  // 256-bit key
const keyHash = await bcrypt.hash(key, 10);  // 10 rounds
```
**Analysis**: bcrypt with 10 rounds is acceptable but below the 2024+ recommendation of 12 rounds. For API keys (which are 256-bit random values), the cost factor is less critical than for passwords since brute-force attacks against the hash are infeasible regardless.
**Impact**: Low — 256-bit key entropy makes cost factor the secondary defense
**OWASP**: A02:2021 Cryptographic Failures
**CWE**: CWE-916 (Use of Password Hash With Insufficient Computational Effort)
**Recommendation**: Consider increasing to 12 rounds for defense-in-depth. Performance impact is minimal for key generation (not on every request).

## Positive Observations

1. **No Hardcoded Cryptographic Keys**: All secrets loaded via ConfigService from environment
2. **RS256 Algorithm Pinning**: JWT strategy restricts to RS256 only — prevents algorithm confusion attacks (CWE-347 mitigated)
3. **JWKS with Rate Limiting**: 5 requests/minute prevents DoS on key fetching; in-memory cache
4. **256-bit Entropy Throughout**: API keys, CSRF tokens all use crypto.randomBytes(32)
5. **No Math.random() for Security**: All security-relevant random values use crypto module (CWE-338 not present)
6. **Timing-Safe Comparison**: bcrypt.compare() prevents timing attacks on API key validation
7. **SHA-256 for Integrity**: Config hashing uses SHA-256 (not MD5/SHA1)
8. **PKCE S256**: OAuth flow uses SHA-256 code challenge method (RFC 7636)
9. **Helmet HSTS**: Forces HTTPS with 1-year max-age + includeSubDomains
10. **Secure Cookie Flags**: Production cookies use `secure: true`
