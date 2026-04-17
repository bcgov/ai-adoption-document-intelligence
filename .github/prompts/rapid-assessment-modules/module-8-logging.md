# Module 8: Security Logging Analysis

**Output**: `findings/security/logging-analysis.md`
**Time estimate**: 15-20 minutes

## Objective

Analyze logging practices for security vulnerabilities (log injection, sensitive data exposure) and audit trail completeness.

## Analysis Areas

### 8a. Log Injection

User input written directly to log statements without sanitization. Attackers can inject fake log entries or CRLF sequences.

Search for patterns where request parameters, user input, or external data flows directly into log calls:
- `logger.info("User: " + request.getParameter("user"))`
- `log.debug(f"Input: {user_input}")`
- `console.log("Data: " + req.body.data)`

### 8b. Sensitive Data in Logs

Check that these are NOT logged:
- Passwords (even failed login attempts)
- Authentication tokens, session IDs
- Credit card numbers, SSNs, PII
- Full request bodies containing sensitive form data
- Database connection strings with credentials
- API keys or secrets

Search patterns: `log.*password|log.*token|log.*secret|log.*credit|log.*ssn|logger.*password`

### 8c. Audit Trail Completeness

Check if these security events are logged:

| Event | Should Be Logged | Priority |
|-------|-----------------|----------|
| Login success/failure | Yes | HIGH |
| Logout | Yes | MEDIUM |
| Authorization failures (403) | Yes | HIGH |
| Password changes | Yes | HIGH |
| Account lockout | Yes | HIGH |
| Admin actions | Yes | CRITICAL |
| Data exports | Yes | HIGH |
| Configuration changes | Yes | HIGH |
| Input validation failures | Yes | MEDIUM |

### 8d. Logging Framework Security

- **Logging library versions**: Check for known vulnerabilities in the logging framework (cross-reference Trivy if available)
- **Logging configuration exposure**: Can the log config be accessed externally?
- **Log file permissions**: Are log files world-readable?
- **Log destination**: File, console, remote syslog, centralized logging

### 8e. Error Handling & Information Disclosure

- `e.printStackTrace()` in catch blocks — leaks to stdout/response
- Stack traces in HTTP responses
- Verbose error messages revealing internal paths, database schema, or library versions
- Generic error pages vs. detailed error pages

## Search Patterns

```
# Logging calls
logger\.|log\.|console\.log|System\.out\.print|print\(|logging\.|Log\.

# Error handling
printStackTrace|catch.*Exception|except.*Exception|try.*catch

# Sensitive logging
log.*password|log.*token|log.*secret|log.*credential|log.*key
```

## Required Output Format

```markdown
# Security Logging Analysis

**Analysis Date**: [date]
**Scope**: [files examined]
**Logging Framework**: [Log4j/SLF4J/java.util.logging/etc.]

## Logging Framework Assessment

| Property | Value | Risk |
|----------|-------|------|
| Framework | [name + version] | [any CVEs] |
| Configuration file | [path] | [accessible externally?] |
| Log level (production) | [DEBUG/INFO/WARN] | [appropriate?] |

## Audit Trail Coverage

| Event | Logged? | Location | Assessment |
|-------|---------|----------|-----------|
| Login success | [Yes/No] | [file:line] | [Adequate/Missing] |
| Login failure | [Yes/No] | [file:line] | [Adequate/Missing] |
| Authorization denied | [Yes/No] | [file:line] | [Adequate/Missing] |
| [etc.] | | | |

## Findings

### Finding LOG-[N]: [Title] — [SEVERITY]

**File**: [exact path]
**Lines**: [range]
**Evidence**:
```[language]
[code snippet]
```
**Analysis**: [why this is a logging security issue]
**Impact**: [what could happen — log forgery, data exposure, compliance failure]
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**CWE**: [CWE-NNN — e.g., CWE-117 Log Injection, CWE-532 Info Exposure Through Log]
**Recommendation**: [specific fix]

## Positive Observations

[Good logging practices found]
```
