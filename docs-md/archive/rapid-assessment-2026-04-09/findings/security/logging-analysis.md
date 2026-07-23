# Security Logging Analysis

**Analysis Date**: 2026-04-09
**Scope**: src/logging/, src/audit/, and all logging calls across src/
**Logging Framework**: @ai-di/shared-logging (custom NestJS wrapper)

## Logging Framework Assessment

| Property | Value | Risk |
|----------|-------|------|
| Framework | @ai-di/shared-logging (custom) | No known CVEs |
| Log Format | NDJSON (Newline-Delimited JSON) | Machine-parseable ✓ |
| Output | stdout (production) | Structured ✓ |
| Log Level Config | `LOG_LEVEL` env var (debug/info/warn/error) | Dynamic ✓ |
| Built-in Redaction | apiKey, api_key, token, authorization, secret, password, cookie | Partial ⚠ |
| Request Context | AsyncLocalStorage (requestId, actorId, userId, clientIp) | Request-scoped ✓ |

## Audit Trail Coverage

| Event | Logged? | Location | Assessment |
|-------|---------|----------|-----------|
| Login success | ❌ No | — | **CRITICAL GAP** |
| Login failure | ❌ No | — | **CRITICAL GAP** |
| Token refresh | ❌ No | — | **CRITICAL GAP** |
| API key generation | ⚠ Partial | src/actor/api-key.service.ts | Logged but not in audit table |
| API key deletion | ⚠ Partial | src/actor/api-key.service.ts | Logged but not in audit table |
| Authorization denied | ❌ No | — | **CRITICAL GAP** |
| Group created | ✅ Yes | src/group/group.service.ts | Audit event recorded |
| Group updated | ✅ Yes | src/group/group.service.ts | Audit event recorded |
| Group deleted | ✅ Yes | src/group/group.service.ts | Audit event recorded |
| Member added | ✅ Yes | src/group/group.service.ts | Audit event recorded |
| Member removed | ✅ Yes | src/group/group.service.ts | Audit event recorded |
| Document accessed | ✅ Yes | src/document/document.controller.ts | Audit event recorded |
| Document deleted | ✅ Yes | src/document/document.controller.ts | Audit event recorded |
| Input validation failures | ❌ No | — | **CRITICAL GAP** |
| Configuration changes | ❌ No | — | **GAP** |
| Data exports | ❌ No | — | **GAP** |
| Review session actions | ✅ Yes | src/hitl/hitl.service.ts | Multiple events tracked |
| System bootstrap | ✅ Yes | src/bootstrap/bootstrap.service.ts | Audit event recorded |

## Findings

### Finding LOG-1: Missing Authentication Audit Events — CRITICAL

**File**: `apps/backend-services/src/auth/auth.controller.ts`
**Lines**: 226-259 (OAuth callback), 170-195 (refresh)
**Evidence**:
```typescript
// File: src/auth/auth.controller.ts — OAuth callback
@Public()
@Post("callback")
async handleOAuthCallback(...): Promise<{ message: string }> {
  // ... OAuth logic ...
  setAuthCookies(res, tokens, csrfToken);
  return { message: "You are ready to go!" };
  // NO AUDIT EVENT RECORDED
}

// File: src/auth/auth.controller.ts — refresh
@Public()
@Post("refresh")
async refreshToken(...): Promise<RefreshReturnDto> {
  const refreshTokenValue = req.cookies?.[AUTH_COOKIE_NAMES.REFRESH_TOKEN];
  if (!refreshTokenValue) {
    throw new UnauthorizedException("No refresh token available");
    // NO AUDIT EVENT FOR UNAUTHORIZED ATTEMPT
  }
}
```
**Analysis**: Zero audit trail for authentication events. Cannot detect brute force, credential stuffing, unauthorized refresh attempts, or session hijacking.
**Impact**: Critical — breach investigation impossible; regulatory non-compliance (GDPR Article 32, SOC 2)
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-778 (Insufficient Logging)
**Recommendation**: Record `authentication_success` on OAuth callback, `authentication_failure` on failed refresh, `session_started` on token refresh. Include user_id, provider, timestamp.

### Finding LOG-2: Missing Authorization Failure Audit Trail — HIGH

**File**: `apps/backend-services/src/group/group.service.ts`, `src/auth/identity.helpers.ts`
**Lines**: Various
**Evidence**:
```typescript
// File: src/group/group.service.ts
if (!userCanManage) {
  throw new ForbiddenException("Only system admins can create groups");
  // NO AUDIT EVENT
}

// File: src/auth/identity.helpers.ts
if (!Object.hasOwn(identity.groupRoles, groupId)) {
  throw new ForbiddenException("User does not belong to requested group.");
  // NO AUDIT EVENT
}
```
**Analysis**: Authorization denials not audited. Cannot detect privilege escalation attempts, cross-group access attempts, or denied access patterns.
**Impact**: High — no visibility into unauthorized access attempts
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-778 (Insufficient Logging)
**Recommendation**: Record `access_denied` events with actor_id, resource_type, resource_id, reason.

### Finding LOG-3: Stack Traces Logged to Stdout — HIGH

**File**: Multiple files (20+ instances)
**Lines**: Various
**Evidence**:
```typescript
// File: src/document/document.service.ts, line 145
this.logger.error(`Stack: ${error.stack}`);

// File: src/auth/auth.service.ts, lines 188-189
this.logger.error(`OAuth callback failed: ${error.message}`,
  { stack: error instanceof Error ? error.stack : undefined });
```
**Analysis**: Stack traces contain internal file paths, function names, library versions, and potentially sensitive exception message data. While structured logging redacts known keys, stack traces bypass this protection.
**Impact**: High — information disclosure aids reconnaissance; stack traces may contain sensitive data
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-532 (Insertion of Sensitive Information into Log File)
**Recommendation**: Log only error.message in production. Use error.stack only in debug mode.

### Finding LOG-4: API Key Events Not in Audit Trail — MEDIUM

**File**: `apps/backend-services/src/actor/api-key.service.ts`
**Lines**: 73, 91
**Evidence**:
```typescript
// File: src/actor/api-key.service.ts, line 73
this.logger.log(`API key generated for user ${userId} in group ${groupId}`);
// Only to application logger, NOT to audit trail
// NO: this.auditService.recordEvent()
```
**Analysis**: API key lifecycle events (create, delete, regenerate) logged to application log but not to the immutable audit trail. Inconsistent with group/document audit coverage.
**Impact**: Medium — cannot track API key operations for compliance; inconsistent audit coverage
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-778 (Insufficient Logging)
**Recommendation**: Add audit events: `api_key_created`, `api_key_deleted`, `api_key_regenerated`.

### Finding LOG-5: Azure API Key May Appear in Error Logs — MEDIUM

**File**: `apps/backend-services/src/azure/azure.service.ts`
**Lines**: 29, 53
**Evidence**:
```typescript
// File: src/azure/azure.service.ts, line 53
const pollResp = await fetch(operationLocation, {
  headers: { "api-key": this.apiKey },
});
```
**Analysis**: Azure API key passed in HTTP headers. If fetch throws an error, headers containing `api-key` could be captured in error stack/message. The redaction framework checks for `apiKey` key name but HTTP header logs may not be caught.
**Impact**: Medium — Azure API key exposure in error scenarios
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-532 (Sensitive Information in Log File)
**Recommendation**: Wrap Azure client calls to catch and strip credential-bearing error details before logging.

### Finding LOG-6: Input Validation Failures Not Logged — MEDIUM

**File**: `apps/backend-services/src/main.ts`
**Lines**: 108-114
**Evidence**:
```typescript
// File: src/main.ts, lines 108-114
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
}));
// Rejects are converted to HTTP 400 but never logged/audited
```
**Analysis**: ValidationPipe rejects invalid payloads as HTTP 400 but does not log them. Cannot detect fuzzing, scanning, or injection attempts.
**Impact**: Medium — no visibility into input attack patterns
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-778 (Insufficient Logging)
**Recommendation**: Create custom validation exception filter that logs field names (not values) of failed validations.

### Finding LOG-7: Inconsistent Stack Trace Redaction — MEDIUM

**File**: `packages/logging/src/logger.ts`
**Lines**: 47-56
**Evidence**:
```typescript
// File: packages/logging/src/logger.ts
const SECRET_KEYS = new Set(["apiKey", "api_key", "token", "authorization", ...]);
function redactContext(context: LogContext): Record<string, unknown> {
  // Only redacts top-level keys matching SECRET_KEYS
  // Does NOT redact: stack field, nested secrets, errorDetails, responseBody
}
```
**Analysis**: Redaction only works for context keys matching the whitelist. Stack traces, nested secrets in deep objects, and custom keys like `errorDetails` or `responseBody` are not redacted.
**Impact**: Medium — false confidence in redaction effectiveness
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-532 (Sensitive Information in Log File)
**Recommendation**: Add deep-scan for secret-like values in nested objects. Add `stack`, `errorDetails`, `responseBody` to redaction.

### Finding LOG-8: Log Injection via User Input — LOW

**File**: Multiple files
**Lines**: Various
**Evidence**:
```typescript
// File: src/document/document.controller.ts
this.logger.debug(`Document ID: ${documentId}`);

// File: src/hitl/hitl.service.ts
this.logger.debug(`Getting session: ${id}`);
```
**Analysis**: User-supplied IDs interpolated into log message strings. Mitigated by NDJSON structured logging (JSON serialization escapes special characters, prevents newline injection).
**Impact**: Low — structured logging format mitigates; not zero risk
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: CWE-117 (Improper Output Neutralization for Logs)
**Recommendation**: Move interpolations to context object: `this.logger.debug("Document accessed", { documentId })`.

## Positive Observations

1. **Structured NDJSON Logging**: Machine-parseable, prevents log injection via format control
2. **Built-in Redaction Framework**: Common secret key names automatically redacted
3. **Request Context Propagation**: AsyncLocalStorage for requestId, actorId, userId, clientIp
4. **Dedicated Audit Service**: Append-only audit_event table, separate from application logs
5. **Comprehensive Group & Document Audit**: Group lifecycle and document access/deletion tracked
6. **Non-Breaking Audit**: Audit write failures don't fail main operations
7. **HttpOnly Cookie Security**: Auth tokens not accessible to JavaScript
