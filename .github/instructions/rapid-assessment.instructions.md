---
applyTo: "**/rapid-assessment/**"
---

# Rapid Assessment — Persistent Instructions

These rules apply to ALL phases and modules of the rapid assessment. Violating them invalidates the assessment.

## Evidence Standards (MANDATORY)

Every finding in every module MUST include:

1. **Exact file path** relative to workspace root
2. **Line numbers** (e.g., lines 44-46)
3. **Code snippet** in a fenced code block with language tag
4. **Technical analysis** explaining WHY it is a vulnerability or risk
5. **Severity rating** with justification: CRITICAL / HIGH / MEDIUM / LOW

## False Positive Prevention Rules

- **NO** SQL injection claims if parameterized queries or prepared statements are used
- **NO** XSS claims for static HTML content that does not render user input
- **NO** assumptions about framework behavior without verifying the actual code
- **NO** speculation about runtime behavior not visible in source code
- **NO** marking development placeholder values as production secrets without evidence
- **NO** inventing file paths, line numbers, or code snippets — every reference must be verified by reading the actual file
- **ALWAYS** distinguish between: confirmed vulnerability, potential risk, and informational finding
- **ALWAYS** check if a finding is already mitigated by other code before reporting it

## CVE Analysis Rules

- Trivy results are the AUTHORITATIVE source for CVE identification
- Do NOT manually guess CVEs from library names — only report CVEs confirmed by Trivy or that you can verify against known affected version ranges with high confidence
- When Trivy is unavailable, clearly mark dependency risk assessments as "AI-estimated — verify with a dependency scanner"
- Do NOT cite specific CVE numbers unless confirmed by Trivy or you have high confidence the version falls within the known affected range

## Tool Restrictions

- **Read-only analysis**: Use read and search tools to inspect source code, configs, and dependencies
- **Terminal (scoped)**: Use terminal execution **only** for Trivy commands and `mkdir` for creating output directories. Do not run any other commands.
- **File output (scoped)**: Use edit tools **only** to create files within the `rapid-assessment/` folder. Do **not** modify any source files, configuration files, or dependency manifests.
- **Do not** run build commands, install packages, or execute application code.

## Context Management

- For projects with > 200 source files: MUST use subagent delegation for Phase 3
- For projects with > 1,000 source files: MUST split code-scanning modules by component
- Do NOT read every source file into the main agent context — delegate file reading to subagents
- Pass each subagent ONLY the file paths relevant to its module and component scope
- Summarize Trivy JSON output immediately; do not keep raw JSON in context

## Accuracy Limitations

This tool uses LLM-based static analysis. Be aware of inherent limits:

- **Single-file analysis only**: Cannot trace tainted data across method calls or files
- **Pattern-dependent coverage**: Only vulnerabilities matching search patterns will be found
- **CVE accuracy depends on Trivy**: Without Trivy, dependency risk assessments are AI-estimated
- **Best-effort coverage, not deterministic**: Files with no pattern matches are assumed clean

For high-assurance assessments, supplement with dedicated SAST tools (Semgrep, CodeQL, SpotBugs).
