# Module 2: Dependency Analysis

**Output**: `findings/dependencies/dependency-inventory.md` + `findings/dependencies/component-dependencies/*.md`
**Time estimate**: 15-30 minutes

## Objective

Catalog every third-party dependency, assess version risk, map CVEs from Trivy (if available), identify EOL libraries, and produce per-component dependency breakdowns.

## Steps

1. Locate all dependency sources:
   - JARs in `lib/`, `WEB-INF/lib/`, or similar library directories
   - Dependency manifests: `pom.xml`, `build.gradle`, `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `composer.json`, `Cargo.toml`, `*.csproj`
   - Vendored libraries
2. For each dependency, extract: name, version (from filename, manifest, or JAR metadata)
3. Cross-reference against Trivy findings (provided by orchestrator) — use Trivy CVEs as authoritative
4. For dependencies NOT covered by Trivy, assess risk based on:
   - Age (version release date vs. current year 2026) — mark as "AI-estimated"
   - Known EOL status (check if the library has been officially discontinued or superseded)
   - Library reputation and maintenance status
5. Map each dependency to the architecture component(s) that use it (check import statements)
6. Write the main inventory and per-component files

## CVE Analysis Rules

- Trivy findings are AUTHORITATIVE — use exact CVE IDs, severity, and fixed versions from Trivy
- Mark Trivy-sourced CVEs with `[Trivy]` tag
- For manual CVE identification (when Trivy unavailable), mark with `[AI-estimated]` and add disclaimer
- Do NOT cite specific CVE numbers unless confirmed by Trivy or you have high confidence the version falls within the known affected range — misattributing CVEs undermines credibility
- Do NOT invent CVE numbers — if unsure, describe the risk category without a specific CVE

## Required Output Format — Main Inventory

```markdown
# Dependency Inventory

**Analysis Date**: [date]
**Total Dependencies**: [count]
**Source**: [JARs in lib/, manifest files, etc.]
**Trivy Scan**: [Available / Unavailable]

## Risk Summary

| Risk Level | Count | Key Concerns |
|------------|-------|-------------|
| CRITICAL | X | [Brief] |
| HIGH | X | [Brief] |
| MEDIUM | X | [Brief] |
| LOW | X | [Brief] |

## Full Inventory

| # | Library | Version | Purpose | Risk | CVEs / Notes | Source |
|---|---------|---------|---------|------|-------------|--------|
| 1 | [name] | [ver] | [purpose] | **CRITICAL** | CVE-XXXX-XXXXX [Trivy] | [JAR/manifest] |
| 2 | [name] | [ver] | [purpose] | LOW | No known CVEs | [JAR/manifest] |

## EOL / Unmaintained Libraries

| Library | Version | EOL Since | Replacement | Urgency |
|---------|---------|-----------|-------------|---------|
| [name] | [ver] | [year] | [modern alternative] | [CRITICAL/HIGH/MEDIUM] |

## Transitive Dependency Notes

[Note whether transitive dependencies were analyzed (Trivy covers these) or only direct dependencies (JAR listing)]
```

## Required Output Format — Per-Component Files

Write one file per architecture component as `component-dependencies/[Component-Name].md`:

```markdown
# [Component Name] - Dependency Analysis

## Component Overview
- **Purpose**: [description]
- **Key Files**: [main source files]
- **Directory**: [path]

## Dependencies Used

| Library | Version | Usage in Component | Risk |
|---------|---------|-------------------|------|
| [name] | [ver] | [how this component uses it — specific classes/methods] | [risk] |

## Security Implications

[Analysis of how these dependencies affect this component's security posture. Which vulnerabilities are actually reachable through this component's code paths?]
```
