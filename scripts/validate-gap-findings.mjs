// scripts/validate-gap-findings.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = [
  "id",
  "pass",
  "title",
  "severity",
  "type",
  "evidence",
  "surfaces",
  "disposition",
  "rationale",
];

const ENUMS = {
  pass: ["A", "B", "C", "D"],
  severity: ["blocker", "major", "minor"],
  type: ["design-gap", "impl-gap", "non-goal"],
  disposition: ["fix", "defer", "won't-support"],
};

// "path/to/file.ts:123" — a file reference. Anything else is prose evidence.
const FILE_REF = /^([\w./@-]+\.[a-z]{2,5}):(\d+)$/;

/**
 * Validates an array of gap findings against the shared schema (design §4.5)
 * and checks that every file:line evidence citation actually resolves.
 *
 * @param {object[]} findings
 * @param {{ repoRoot: string }} opts
 * @returns {{ errors: string[] }}
 */
export function validateFindings(findings, { repoRoot }) {
  const errors = [];
  const seen = new Set();

  for (const [index, finding] of findings.entries()) {
    const label = finding?.id ?? `#${index}`;

    for (const field of REQUIRED) {
      if (finding?.[field] === undefined || finding[field] === "") {
        errors.push(`${label}: missing required field "${field}"`);
      }
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      const value = finding?.[field];
      if (value !== undefined && !allowed.includes(value)) {
        errors.push(
          `${label}: "${field}" must be one of ${allowed.join(", ")} — got "${value}"`,
        );
      }
    }

    if (finding?.surfaces !== undefined && !Array.isArray(finding.surfaces)) {
      errors.push(`${label}: "surfaces" must be an array`);
    }

    if (finding?.id !== undefined) {
      if (seen.has(finding.id)) errors.push(`${label}: duplicate id`);
      seen.add(finding.id);
    }

    const match = FILE_REF.exec(finding?.evidence ?? "");
    if (match) {
      const [, path, lineText] = match;
      const absolute = resolve(repoRoot, path);
      if (!existsSync(absolute)) {
        errors.push(`${label}: evidence file does not exist — ${path}`);
      } else {
        const lineCount = readFileSync(absolute, "utf8").split("\n").length;
        const line = Number(lineText);
        if (line > lineCount) {
          errors.push(
            `${label}: evidence line ${lineText} is past end of ${path} (${lineCount} lines)`,
          );
        }
      }
    }
  }

  return { errors };
}

// CLI: node scripts/validate-gap-findings.mjs <findings.json> [...]
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node scripts/validate-gap-findings.mjs <findings.json> [...]");
    process.exit(2);
  }

  let failed = false;
  for (const file of files) {
    const findings = JSON.parse(readFileSync(file, "utf8"));
    const { errors } = validateFindings(findings, { repoRoot: process.cwd() });
    if (errors.length > 0) {
      failed = true;
      console.error(`\n${file} — ${errors.length} problem(s):`);
      for (const error of errors) console.error(`  ${error}`);
    } else {
      console.log(`${file} — ${findings.length} finding(s), clean`);
    }
  }
  process.exit(failed ? 1 : 0);
}
