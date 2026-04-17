# Module 6: Configuration Security Analysis

**Output**: `findings/security/configuration-security.md`
**Time estimate**: 15-20 minutes

## Objective

Scan all configuration files, deployment descriptors, and infrastructure definitions for security misconfigurations.

## Analysis Areas

### 6a. Web Server / Application Server Configuration

| Stack | Config Files to Examine |
|-------|------------------------|
| Java | `web.xml`, `weblogic.xml`, `server.xml`, `context.xml`, `application.xml` |
| .NET | `web.config`, `appsettings.json`, `appsettings.*.json` |
| Node.js | Express middleware setup, Helmet config, `app.js`/`server.js` |
| Python | Django `settings.py`, Flask `config.py`, `wsgi.py` |
| PHP | `.htaccess`, `php.ini`, `nginx.conf` |

Check for:
- HTTP vs HTTPS transport guarantees
- Security constraints and URL pattern protection
- Error page configuration (custom vs. default stack traces)
- Directory listing enabled
- Request size limits
- Timeout configuration

### 6b. Security Headers

Check if the application sets or is configured to set:

| Header | Purpose | Missing = Risk Level |
|--------|---------|---------------------|
| `Strict-Transport-Security` (HSTS) | Force HTTPS | MEDIUM |
| `Content-Security-Policy` (CSP) | Prevent XSS, clickjacking | MEDIUM |
| `X-Frame-Options` | Prevent clickjacking | MEDIUM |
| `X-Content-Type-Options: nosniff` | Prevent MIME sniffing | LOW |
| `X-XSS-Protection` | XSS filter (legacy) | LOW |
| `Referrer-Policy` | Control referrer leakage | LOW |
| `Permissions-Policy` | Control browser features | LOW |

### 6c. CORS Configuration

- Wildcard `Access-Control-Allow-Origin: *` on authenticated endpoints
- Credentials allowed with permissive origins
- Missing CORS on API endpoints that should have it

### 6d. Debug / Development Mode

- `DEBUG = True` in production config
- Stack traces in error responses
- Debug endpoints exposed (`/debug`, `/actuator`, `/phpinfo`, `/__debug__`)
- Verbose logging levels in production

### 6e. CSRF Configuration

- Framework CSRF protection disabled or partially configured
- CSRF exempt decorators on state-changing endpoints without justification

### 6f. Template Engine Configuration

- Auto-escaping disabled globally
- Template injection risks from user-controlled template names

### 6g. Database Connection Configuration

- Plaintext credentials in config files committed to source control
- Default database passwords
- Database connection without TLS/SSL

### 6h. Deployment & Infrastructure

- Dockerfiles running as root
- Secrets in Dockerfiles, docker-compose.yml, or CI config
- Exposed ports beyond what's necessary
- Missing health check endpoints

## Required Output Format

```markdown
# Configuration Security Analysis

**Analysis Date**: [date]
**Scope**: [config files examined — list them]

## Configuration Files Reviewed

| File | Type | Security Relevant |
|------|------|-------------------|
| [path] | [web server / framework / deployment] | [Yes/No] |

## Security Headers Assessment

| Header | Status | Configuration Location |
|--------|--------|----------------------|
| HSTS | [Present/Missing] | [file:line or N/A] |
| CSP | [Present/Missing] | [file:line or N/A] |
| X-Frame-Options | [Present/Missing] | [file:line or N/A] |
| X-Content-Type-Options | [Present/Missing] | [file:line or N/A] |

## Findings

### Finding CFG-[N]: [Title] — [SEVERITY]

**File**: [exact path]
**Lines**: [range]
**Evidence**:
```[language/xml/yaml]
[config snippet]
```
**Analysis**: [why this configuration is insecure]
**Impact**: [what risk this creates]
**OWASP**: A05:2021 Security Misconfiguration
**CWE**: [CWE-NNN]
**Recommendation**: [specific config change with example]

## Positive Configuration Practices

[List secure configurations found — e.g., "SSL/TLS enforced in web.xml transport-guarantee"]
```
