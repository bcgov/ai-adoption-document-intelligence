---
mode: "agent"
description: "Perform a comprehensive rapid security and technical debt assessment using parallel subagents. Produces architecture analysis, file inventory, dependency mapping, 10-module security scan, testing gap analysis, and validated findings with evidence."
tools: ["read/readFile", "read/readNotebookCellOutput", "read/problems", "search/textSearch", "search/fileSearch", "search/listDirectory", "search/codebase", "search/searchSubagent", "execute/runInTerminal", "execute/getTerminalOutput", "agent/runSubagent", "edit", "todo"]
---

# Rapid Assessment Agent — Orchestrator

You are the orchestrator for a comprehensive security and technical debt assessment.
You coordinate phases, dispatch subagents for analysis modules, and produce the final validated report.

Refer to `.github/instructions/rapid-assessment.instructions.md` for evidence standards, false positive prevention rules, and CVE analysis rules. Those rules are MANDATORY for all phases and subagents.

## Target Selection

The user will specify which directory to scan. If not specified, use `search/listDirectory` to list top-level directories that contain source code, then ask which to scan.

Set `TARGET_DIR` to the resolved directory path. All output goes under `TARGET_DIR/rapid-assessment/`.

---

## Output Structure

Create this directory tree under `TARGET_DIR/rapid-assessment/`:

```
rapid-assessment/
├── README.md
├── status/
│   ├── README.md
│   └── progress.md
├── findings/
│   ├── README.md
│   ├── summary/
│   │   ├── README.md
│   │   ├── architecture-diagram.md      ← Module 1
│   │   ├── executive-summary.md         ← Phase 5
│   │   ├── file-inventory.md            ← Phase 2
│   │   └── trivy-results.md             ← Phase 0 (if available)
│   ├── dependencies/
│   │   ├── README.md
│   │   ├── dependency-inventory.md      ← Module 2
│   │   └── component-dependencies/      ← Module 2 (one file per component)
│   ├── security/
│   │   ├── README.md
│   │   ├── code-vulnerabilities.md      ← Module 4
│   │   ├── secrets-analysis.md          ← Module 3
│   │   ├── authentication-analysis.md   ← Module 5
│   │   ├── configuration-security.md    ← Module 6
│   │   ├── cryptographic-analysis.md    ← Module 7
│   │   ├── logging-analysis.md          ← Module 8
│   │   └── database-analysis.md         ← Module 10
│   └── testing/
│       ├── README.md
│       └── testing-analysis.md          ← Module 9
├── validation-report.md                 ← Phase 5
└── final-summary.md                     ← Phase 5
```

---

## Phase 0 — Trivy Automated Scan (Optional)

### 0a. Check availability

Use `execute/runInTerminal` to run:
```bash
trivy --version
```

If not found, log in `progress.md` and skip to Phase 1.

### 0b. Run filesystem scan

Use `execute/runInTerminal`:
```bash
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --format json --skip-dirs node_modules,target,.git TARGET_DIR
```

**Allowed flags**: `fs`, `--scanners`, `--severity`, `--format json`, `--skip-dirs`, `--timeout`. No others.

### 0c. Parse and save results

Use `execute/getTerminalOutput` to retrieve the JSON. Parse vulnerabilities, secrets, and misconfigurations. Write `findings/summary/trivy-results.md` with structured tables. Summarize immediately — do NOT keep raw JSON in context.

---

## Phase 1 — Initialization

1. Create the full output directory structure using `execute/runInTerminal` with `mkdir -p`
2. Create `README.md` files for each directory
3. Initialize `status/progress.md`:

```markdown
# Rapid Assessment Progress Tracker

## Assessment Metadata
- **Target**: [TARGET_DIR name]
- **Start Time**: [YYYY-MM-DD HH:MM UTC]
- **Assessment Framework**: Rapid Assessment v3.0 (Copilot + Subagents)

## Phase Status
| Phase | Status | Start | End | Duration |
|-------|--------|-------|-----|----------|
| Phase 0: Trivy Scan | | | | |
| Phase 1: Initialization | In Progress | [time] | | |
| Phase 2: File Inventory | Not Started | | | |
| Phase 3: Analysis (10 modules) | Not Started | | | |
| Phase 4: Coverage Verification | Not Started | | | |
| Phase 5: Validation & Report | Not Started | | | |
```

4. Detect the project's tech stack using `search/fileSearch` and `search/textSearch`:

| Indicator Files | Stack |
|---|---|
| `pom.xml`, `build.gradle`, `*.java` | Java (Maven/Gradle) |
| `*.csproj`, `*.sln`, `web.config` | .NET / ASP.NET |
| `package.json`, `*.ts`, `*.js` | Node.js / TypeScript |
| `requirements.txt`, `pyproject.toml`, `*.py` | Python |
| `go.mod`, `*.go` | Go |
| `Gemfile`, `*.rb` | Ruby |
| `composer.json`, `*.php` | PHP |
| `Cargo.toml`, `*.rs` | Rust |

Also detect framework-specific markers (Spring, Django, Express, Rails, Struts, etc.) and template engines (JSP, Thymeleaf, Jinja2, Razor, EJS, Blade, ERB).

5. Record tech stack in the top-level `README.md`
6. Update `progress.md`

---

## Phase 2 — Complete File Inventory

This phase establishes the coverage baseline. You MUST catalog every file before analysis begins.

### 2a. Enumerate all files

Use `search/fileSearch` patterns to discover every file in TARGET_DIR. Classify each by:

| Classification | Extensions |
|---|---|
| Source code | `.java`, `.py`, `.js`, `.ts`, `.cs`, `.go`, `.rb`, `.php`, `.rs` |
| Templates | `.jsp`, `.html`, `.cshtml`, `.jinja2`, `.ejs`, `.blade.php`, `.erb` |
| Configuration | `.xml`, `.properties`, `.yml`, `.yaml`, `.json`, `.toml`, `.ini`, `.conf` |
| Build/Deploy | `pom.xml`, `build.gradle`, `Dockerfile`, `docker-compose.yml`, CI configs |
| Database scripts | `.sql`, migration files |
| Static assets | `.css`, client-side `.js`, images |
| Dependencies | `.jar`, `.dll`, vendored libraries |
| Documentation | `.md`, `.txt`, `.doc` |

### 2b. Write file inventory

Write `findings/summary/file-inventory.md` with:
- Summary table by category (count + security-relevant flag)
- Detailed file listing per category: file path, language, approximate line count, component assignment
- Total counts

### 2c. Identify architecture components

Group files into logical architecture components (Web Layer, Business Logic, Data Access, External Integration, Scheduling, etc.). This component mapping is passed to Phase 3 subagents.

### 2d. Assess project scale and plan subagent strategy

Count total security-relevant files (source + templates + config):

| Scale | Source Files | Strategy |
|-------|-------------|----------|
| Small | < 200 | One subagent per module (10 subagents total) |
| Medium | 200-1,000 | One subagent per module (10 subagents total) |
| Large | 1,000+ | Split analysis modules by component (see Large Project Handling below) |

### 2e. Prepare subagent context

For each subagent, prepare a **focused** context containing only what that module needs:

- Tech stack summary (shared by all)
- **Only the component(s) and file paths relevant to that module**
- Trivy findings relevant to that module's scope (if available)
- The evidence standards and false positive prevention rules from the instructions file

### 2f. Update progress

Log completion in `progress.md` with file counts, component summary, and chosen dispatch strategy.

---

## Phase 3 — Security & Technical Analysis (10 Modules via Subagents)

**This is the core analysis phase. Dispatch subagents for parallel execution.**

For each module, read the corresponding module file from `.github/prompts/rapid-assessment-modules/`, then dispatch a subagent using `agent/runSubagent` with:
- The module instructions from the file
- The subagent context from Phase 2e (tech stack, components, file paths, Trivy findings)
- The evidence standards and false positive prevention rules
- The exact output file path

### Dispatch strategy (standard — under 1,000 source files)

**Wave 1** (run in parallel — these inform later modules):
- **Module 1**: Architecture Analysis → `findings/summary/architecture-diagram.md`
- **Module 2**: Dependency Analysis → `findings/dependencies/dependency-inventory.md` + `component-dependencies/*.md`

**Wave 2** (run in parallel after Wave 1 — these are independent of each other):
- **Module 3**: Secrets Analysis → `findings/security/secrets-analysis.md`
- **Module 4**: Code Vulnerability Analysis → `findings/security/code-vulnerabilities.md`
- **Module 5**: Authentication & Authorization → `findings/security/authentication-analysis.md`
- **Module 6**: Configuration Security → `findings/security/configuration-security.md`
- **Module 7**: Cryptographic Analysis → `findings/security/cryptographic-analysis.md`
- **Module 8**: Security Logging Analysis → `findings/security/logging-analysis.md`
- **Module 9**: Testing Gap Analysis → `findings/testing/testing-analysis.md`
- **Module 10**: Database Script Analysis → `findings/security/database-analysis.md`

### Dispatch strategy (large projects — 1,000+ source files)

For large projects, analysis modules that scan source code (Modules 3, 4, 5, 7, 8) must be split by architecture component to avoid overwhelming individual subagent context windows.

**Wave 1** (same as standard):
- **Module 1**: Architecture Analysis
- **Module 2**: Dependency Analysis

**Wave 2** (split by component for code-scanning modules):

For each architecture component identified in Phase 2c, dispatch **separate subagents** for the code-heavy modules:

```
Module 4a: Code Vulnerabilities — [Web Layer] (files in web/, controllers/, views/)
Module 4b: Code Vulnerabilities — [Data Access Layer] (files in dao/, repositories/)
Module 4c: Code Vulnerabilities — [Business Logic] (files in service/, domain/)
...etc for each component
```

Each per-component subagent:
- Receives ONLY the file paths for its assigned component
- Writes to a temp file: `findings/security/code-vulnerabilities-[component-name].md`
- After all per-component subagents complete, the orchestrator merges them into the final `code-vulnerabilities.md`

Apply this splitting to these modules (which read source files heavily):
- **Module 3**: Secrets — split if > 500 config + source files
- **Module 4**: Code Vulnerabilities — always split on large projects
- **Module 5**: Authentication — split if auth code spans multiple components
- **Module 7**: Cryptography — split if crypto usage spans multiple components
- **Module 8**: Logging — split if > 500 source files

These modules typically don't need splitting (they scan fewer, targeted files):
- **Module 6**: Configuration Security (only reads config files)
- **Module 9**: Testing Gap Analysis (only reads test directories)
- **Module 10**: Database Script Analysis (only reads .sql and migration files)

**Merging per-component results**: After all per-component subagents for a module complete, read their individual output files and merge into the final module output file. De-duplicate any findings that appear in multiple components. Renumber finding IDs sequentially in the merged file.

### Subagent dispatch template

For each module, use `agent/runSubagent` with a prompt like:

```
You are a security analysis subagent performing Module N: [Module Name].

## Target
[TARGET_DIR path]

## Tech Stack
[From Phase 1]

## Architecture Components
[From Phase 2c — only the relevant subset]

## Trivy Findings (if available)
[Relevant subset from Phase 0]

## Evidence Standards
[Copy from .github/instructions/rapid-assessment.instructions.md]

## Module Instructions
[Content read from .github/prompts/rapid-assessment-modules/module-N-name.md]

## Output
Write your findings to: [exact output file path]
Follow the output template exactly.
```

### After all subagents complete

1. Read each output file to verify it exists and has content
2. If any module failed, log the failure in `progress.md` and note it for Phase 5
3. Update `progress.md` with per-module completion status

---

## Phase 4 — Coverage Verification

1. Read the file inventory from Phase 2
2. Read all Phase 3 output files
3. For each security-relevant source file, verify it appears in at least one module's analysis
4. Generate coverage statistics:

```markdown
## Coverage Statistics
- Source files analyzed: [X] / [Total] ([%])
- Configuration files reviewed: [X] / [Total] ([%])
- Dependencies assessed: [X] / [Total] ([%])
- Template files scanned: [X] / [Total] ([%])
- Overall coverage: [%]
```

5. If coverage is below 95%, identify gaps and dispatch targeted subagents to analyze missed files
6. Record results in `progress.md`

---

## Phase 5 — Validation & Final Report

### 5a. Self-Validation

Write `validation-report.md`:

```markdown
# Assessment Validation Report

**Validation Date**: [date]

## Validation Checklist

1. [ ] **File Coverage**: 95%+ of security-relevant files analyzed
   - Evidence: [file counts, coverage percentage]

2. [ ] **Required Output Files**: All files in output structure exist and have content
   - Evidence: [list all files with status]

3. [ ] **Evidence Standards**: Every finding has file path, line numbers, code snippet
   - Evidence: [spot-check 5 random findings from different modules]

4. [ ] **False Positive Check**: No findings violate the false positive prevention rules
   - Evidence: [review results]

5. [ ] **CVE Accuracy**: All CVE references are from Trivy or verified against known affected ranges
   - Evidence: [cross-reference check]

6. [ ] **Dependency Assessment**: All dependencies have version and risk rating
   - Evidence: [dependency count vs inventory count]

7. [ ] **Architecture Completeness**: All components identified and diagrammed
   - Evidence: [component count]

8. [ ] **No Placeholder Text**: No TODO, TBD, or placeholder content remains
   - Evidence: [search results]

9. [ ] **Cross-Module Consistency**: Findings referenced consistently across modules
   - Evidence: [cross-reference check]

10. [ ] **Severity Ratings Justified**: Each severity has supporting evidence
    - Evidence: [spot-check results]

11. [ ] **Recommendations Actionable**: Each finding has a specific, implementable fix
    - Evidence: [spot-check results]
```

### 5b. Executive Summary

Write `findings/summary/executive-summary.md` consolidating all module findings.

### 5c. Final Summary Report

Write `final-summary.md`:

```markdown
# [Application Name] - Rapid Assessment Final Summary

**Assessment Date**: [date]
**Assessment Framework**: Rapid Assessment v3.0
**Platform**: GitHub Copilot (with subagent delegation)
**Status**: COMPLETED

## Scan Metadata
- **Trivy scan**: Ran / Skipped (with reason)
- **Tech stack**: [detected stack]
- **Files analyzed**: [count]
- **Dependencies assessed**: [count]
- **Analysis modules completed**: [X/10]

## Executive Summary

### Overall Security Posture: [CRITICAL / HIGH / MEDIUM / LOW]

| Severity | Count |
|----------|-------|
| Critical | X |
| High | X |
| Medium | X |
| Low | X |
| **Total** | **X** |

### Top 3 Most Critical Issues
1. **[Issue]**: [one-line description with file reference]
2. **[Issue]**: [one-line description with file reference]
3. **[Issue]**: [one-line description with file reference]

## Architecture Assessment
[Summary from Module 1]

## Critical Security Findings

### CRITICAL Issues — Immediate Action Required
[List each critical finding with: title, location, impact, recommendation]

### HIGH Priority Issues — Next Sprint
[List each high finding]

### MEDIUM Priority Issues — Planned Remediation
[List each medium finding]

### LOW Priority Issues — Backlog
[List each low finding]

## Dependency Risk Summary
| Library | Version | Risk | CVEs / Notes | Source | Action Required |
|---------|---------|------|--------------|--------|-----------------|
| ... | ... | ... | ... | [Trivy] or [Manual] | ... |

## Configuration Review Summary
[Key configuration findings]

## Testing Gap Summary
[Key testing gaps]

## Prioritized Remediation Roadmap

### Immediate (This Week)
1. [Action item with specific file and fix]

### Short-Term (Next Sprint)
1. [Action item]

### Medium-Term (Next Quarter)
1. [Action item]

### Long-Term (Backlog)
1. [Action item]

## OWASP Top 10 (2021) Coverage
| Category | Findings | Severity |
|----------|----------|----------|
| A01: Broken Access Control | X | [highest] |
| A02: Cryptographic Failures | X | [highest] |
| A03: Injection | X | [highest] |
| A04: Insecure Design | X | [highest] |
| A05: Security Misconfiguration | X | [highest] |
| A06: Vulnerable Components | X | [highest] |
| A07: Auth Failures | X | [highest] |
| A08: Software/Data Integrity | X | [highest] |
| A09: Logging Failures | X | [highest] |
| A10: SSRF | X | [highest] |
```

If any **Critical** severity vulnerabilities are found, append exactly this text at the end:

```
THIS ASSESSMENT CONTAINS A CRITICAL VULNERABILITY
```

### 5d. Final progress update

Update `progress.md` with all phase completion times and overall duration.

---

## Checkpointing Rule

After completing each module/phase, verify its output file exists and has non-empty content before proceeding. If a module fails:
1. Log the failure in `progress.md`
2. Note what was missed
3. Continue with remaining modules
4. Address the gap in Phase 4

Do NOT abort the entire assessment for a single module failure.
