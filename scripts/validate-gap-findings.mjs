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
  if (!Array.isArray(findings)) {
    throw new TypeError("validateFindings: findings must be an array");
  }

  const errors = [];
  const seen = new Set();

  for (const [index, finding] of findings.entries()) {
    const label = finding?.id ?? `#${index}`;

    for (const field of REQUIRED) {
      const value = finding?.[field];
      if (value === undefined || value === null || value === "") {
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
        const content = readFileSync(absolute, "utf8");
        const lineCount = content.replace(/\n$/, "").split("\n").length;
        const line = Number(lineText);
        if (line < 1) {
          errors.push(
            `${label}: evidence line ${lineText} is out of range for ${path} (lines are 1-indexed)`,
          );
        } else if (line > lineCount) {
          errors.push(
            `${label}: evidence line ${lineText} is past end of ${path} (${lineCount} lines)`,
          );
        }
      }
    }
  }

  return { errors };
}

// "object" | "null" | "number" | ... — mirrors typeof but calls out null explicitly,
// since typeof null === "object" would be a confusing error message.
function describeType(value) {
  return value === null ? "null" : typeof value;
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
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch (error) {
      failed = true;
      console.error(`${file} — cannot read: ${error.message}`);
      continue;
    }

    let findings;
    try {
      findings = JSON.parse(raw);
    } catch (error) {
      failed = true;
      console.error(`${file} — invalid JSON: ${error.message}`);
      continue;
    }

    if (!Array.isArray(findings)) {
      failed = true;
      console.error(`${file} — expected a JSON array of findings, got ${describeType(findings)}`);
      continue;
    }

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
