# Module 4: Code Vulnerability Analysis (SAST)

**Output**: `findings/security/code-vulnerabilities.md`
**Time estimate**: 20-40 minutes

## Objective

Scan all source files and templates for security vulnerabilities using language-appropriate detection patterns. This is the deepest analysis module — read the actual source code, understand the context, and assess real exploitability.

## Vulnerability Categories

### 4a. SQL Injection

Search for string-concatenated queries and unparameterized database calls:

| Stack | Vulnerable Pattern | Safe Pattern (NOT a finding) |
|-------|--------------------|------------------------------|
| Java | `Statement.executeQuery("SELECT " + userInput)` | `PreparedStatement` with `?` params |
| Java | `"SELECT * FROM " + table + " WHERE id=" + id` | Named parameters in JPA/Hibernate |
| .NET | `SqlCommand("SELECT " + input)` | `SqlParameter` usage |
| Python | `cursor.execute(f"SELECT {input}")` | `cursor.execute("SELECT %s", (input,))` |
| Node.js | `mysql.query("SELECT " + req.body.id)` | Parameterized queries |
| PHP | `mysql_query("SELECT " . $_GET['id'])` | PDO prepared statements |
| Go | `db.Query(fmt.Sprintf("SELECT %s", input))` | `db.Query("SELECT $1", input)` |

### 4b. Cross-Site Scripting (XSS)

Search for unescaped output in templates and responses:

| Engine | Vulnerable | Safe |
|--------|-----------|------|
| JSP | `<%= request.getParameter("x") %>` | `<c:out value="${param.x}"/>`, `fn:escapeXml()` |
| Thymeleaf | `th:utext="${userInput}"` | `th:text="${userInput}"` |
| Razor | `@Html.Raw(userInput)` | `@userInput` (auto-escaped) |
| Jinja2 | `{{ input\|safe }}`, `Markup(input)` | `{{ input }}` (auto-escaped) |
| EJS | `<%- userInput %>` | `<%= userInput %>` (escaped) |
| Blade | `{!! $input !!}` | `{{ $input }}` (escaped) |
| ERB | `<%= raw(input) %>`, `input.html_safe` | `<%= input %>` (escaped) |
| Any | `response.getWriter().print(request.getParameter("x"))` | Output encoding before write |

### 4c. Cross-Site Request Forgery (CSRF)

- Forms without CSRF tokens (check `<form>` tags against CSRF middleware)
- Framework CSRF protection explicitly disabled in config
- State-changing operations on GET requests

### 4d. Insecure Deserialization

| Stack | Vulnerable | Safe |
|-------|-----------|------|
| Java | `ObjectInputStream.readObject()` on untrusted data | Whitelist-based deserialization filters |
| Java | `XStream.fromXML(untrusted)` | XStream with type permissions |
| .NET | `BinaryFormatter.Deserialize()` | `System.Text.Json` |
| .NET | `JsonSerializer` with `TypeNameHandling.All` | `TypeNameHandling.None` |
| Python | `pickle.loads(untrusted)` | `json.loads()` |
| Python | `yaml.load(data)` | `yaml.safe_load(data)` |
| Node.js | `node-serialize` with untrusted input | JSON.parse() |
| PHP | `unserialize($userInput)` | `json_decode()` |

### 4e. Path Traversal

- File operations using user-controlled input without canonicalization
- Missing checks for `../` sequences
- `new File(basePath + request.getParameter("file"))`

### 4f. Command Injection

| Stack | Vulnerable |
|-------|-----------|
| Java | `Runtime.getRuntime().exec(userInput)`, `ProcessBuilder` with user args |
| Python | `os.system(userInput)`, `subprocess.call(cmd, shell=True)` |
| Node.js | `child_process.exec(userInput)` |
| PHP | `exec($userInput)`, `system()`, `passthru()`, backtick operator |
| .NET | `Process.Start(userInput)` |

### 4g. XML External Entity (XXE)

- `DocumentBuilderFactory` without `setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)`
- `SAXParserFactory` without secure processing features
- `XMLReader` without entity restrictions
- Any XML parser accepting external input without entity disable

### 4h. Server-Side Request Forgery (SSRF)

- HTTP client calls with user-controlled URLs
- `URL(request.getParameter("url")).openConnection()`
- Missing URL whitelist validation

### 4i. Open Redirects

- `response.sendRedirect(request.getParameter("returnUrl"))`
- Missing validation of redirect targets against allowed domains

### 4j. Sensitive Data Exposure

- `e.printStackTrace()` in catch blocks (leaks to response)
- Verbose error pages enabled in production config
- PII logged without masking

### 4k. Input Validation Gaps

- Request parameters used without type checking or range validation
- Client-only validation with no server-side enforcement

## Analysis Approach

For each category:
1. Use `search/textSearch` to find candidate patterns in source files
2. Use `read/readFile` on the surrounding code context (10-20 lines) to assess actual risk
3. Check if the finding is mitigated by other code (framework protection, wrapper methods, filters)
4. Only report confirmed or high-confidence findings

## Required Output Format

```markdown
# Code Vulnerabilities Analysis

**Analysis Date**: [date]
**Scope**: [count] source files, [count] template files
**Trivy Code Findings**: [count if available, or N/A]

## Summary

| Category | Findings | Highest Severity |
|----------|----------|-----------------|
| SQL Injection | X | [severity] |
| XSS | X | [severity] |
| CSRF | X | [severity] |
| Deserialization | X | [severity] |
| Path Traversal | X | [severity] |
| Command Injection | X | [severity] |
| XXE | X | [severity] |
| SSRF | X | [severity] |
| Open Redirect | X | [severity] |
| Data Exposure | X | [severity] |
| Input Validation | X | [severity] |

## Findings

### [Category] Analysis

#### Finding CV-[N]: [Title] — [SEVERITY]

**Pattern**: [What vulnerability pattern was detected]
**File**: [exact path]
**Lines**: [line range]
**Evidence**:
```[language]
// File: [path], lines [range]
[actual code snippet]
```
**Analysis**:
- [Technical explanation of why this IS vulnerable]
- [What mitigations exist or are missing]
- [Whether the input is actually user-controlled]
**Impact**: [Severity] — [Business/technical impact if exploited]
**OWASP**: [A01-A10 mapping]
**CWE**: [CWE-NNN]
**Recommendation**: [Specific fix with code example if helpful]

[Repeat for each finding]

## Categories With No Findings

[List categories that were scanned but had no findings, with brief explanation of what was checked]
```
