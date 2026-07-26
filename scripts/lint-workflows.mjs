#!/usr/bin/env node
/**
 * Lint every workflow document we ship, and report what the SET does not cover.
 *
 * Two questions, deliberately separate:
 *
 *   1. Is each workflow a proper document?  — schema + semantic validity, run
 *      readiness. Per-workflow. This is what `graph-workflow`'s validator
 *      already answers; the linter just runs it over everything at once so a
 *      catalog or kind-taxonomy change cannot quietly invalidate a shipped
 *      template the way the 2026-07-18 taxonomy wave did.
 *
 *   2. Does the COLLECTION exercise every shape we claim to support? — the
 *      question no per-workflow check can answer, because it is a property of
 *      the set. Every shipped map declares its item key in `config.ctx`, so no
 *      workflow anywhere exercises the not-declared path; a check written
 *      against that path passes whatever the code does. That is how
 *      MANUAL_TEST_PLAN 4.14/4.15 came to assert something unreachable.
 *
 * Shapes come from the spec's own "X can be either A or B" clauses. When a
 * check needs a shape nobody has, add a workflow — do not weaken the check.
 *
 * Usage:
 *   node scripts/lint-workflows.mjs            # templates on disk
 *   node scripts/lint-workflows.mjs --db       # also the seeded demos (needs docker postgres)
 *   node scripts/lint-workflows.mjs --strict   # exit 1 on a required-shape gap
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const require = createRequire(join(repoRoot, "package.json"));

const TEMPLATES_DIR = join(repoRoot, "docs-md/workflows/templates");
const args = new Set(process.argv.slice(2));
const useDb = args.has("--db");
const strict = args.has("--strict");

/** Load the validator from the built package. */
function loadValidator() {
  try {
    const gw = require("@ai-di/graph-workflow");
    return gw.validateGraphWorkflowConfig ?? gw.validateGraphConfig ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ shapes */

/**
 * Each shape is one side of an either/or the product supports. `required: true`
 * means the collection must contain at least one example or `--strict` fails —
 * because without one, any check written against that shape is unfalsifiable.
 */
const SHAPES = [
  {
    id: "map-item-ctx-declared",
    label: "map whose item key IS declared in config.ctx",
    required: false,
    test: (c) =>
      mapsOf(c).some((m) => m.itemCtxKey && c.ctx?.[m.itemCtxKey] !== undefined),
  },
  {
    id: "map-item-ctx-undeclared",
    label: "map whose item key is NOT declared in config.ctx",
    required: true,
    why: "the only shape that can exercise the picker's 'Loop variables' group (MANUAL_TEST_PLAN 4.14/4.15)",
    test: (c) =>
      mapsOf(c).some((m) => m.itemCtxKey && c.ctx?.[m.itemCtxKey] === undefined),
  },
  {
    id: "map-reached-by-edge",
    label: "map with a real edge to its body entry",
    required: true,
    why: "G-106 ruling A treats map→bodyEntry as implicit; nothing shipped has the explicit form",
    test: (c) =>
      mapsOf(c).some((m) =>
        (c.edges ?? []).some(
          (e) => e.source === m.id && e.target === m.bodyEntryNodeId,
        ),
      ),
  },
  {
    id: "map-reached-by-setting-only",
    label: "map reached ONLY via its bodyEntry setting",
    required: false,
    test: (c) =>
      mapsOf(c).some(
        (m) =>
          m.bodyEntryNodeId &&
          !(c.edges ?? []).some(
            (e) => e.source === m.id && e.target === m.bodyEntryNodeId,
          ),
      ),
  },
  {
    id: "error-policy-fallback",
    label: "node with an errorPolicy fallback edge",
    required: true,
    why: "the only shape that exercises the error-path routing G-001 added",
    test: (c) =>
      nodesOf(c).some((n) => n.errorPolicy?.fallbackEdgeId),
  },
  {
    id: "inline-child-graph",
    label: "childWorkflow with an inline graph",
    required: true,
    why: "validation rules must hold at depth (G-015); an outer-only fixture cannot show that",
    test: (c) => nodesOf(c).some((n) => n.workflowRef?.inline),
  },
  {
    id: "pollUntil-wrapping-activity",
    label: "pollUntil wrapping a catalog activity",
    required: false,
    test: (c) => nodesOf(c).some((n) => n.type === "pollUntil" && n.activityType),
  },
  {
    id: "source-api",
    label: "workflow with a source.api node",
    required: true,
    why: "MANUAL_TEST_PLAN 9.1/9.2 need a workflow where the Try button is visible",
    test: (c) => nodesOf(c).some((n) => n.sourceType === "source.api"),
  },
];

const nodesOf = (c) => Object.values(c.nodes ?? {});
const mapsOf = (c) =>
  nodesOf(c)
    .filter((n) => n.type === "map")
    .map((n) => ({ ...n, id: n.id }));

/* ------------------------------------------------------------------ inputs */

function loadTemplates() {
  let files = [];
  try {
    files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.flatMap((f) => {
    try {
      const raw = JSON.parse(readFileSync(join(TEMPLATES_DIR, f), "utf8"));
      return [{ source: `template:${f}`, config: raw.config ?? raw }];
    } catch (err) {
      return [{ source: `template:${f}`, parseError: String(err) }];
    }
  });
}

function loadSeededDemos() {
  const sql =
    "SELECT l.slug, v.config::text FROM workflow_versions v " +
    "JOIN workflow_lineages l ON v.lineage_id = l.id ORDER BY l.slug;";
  let out;
  try {
    out = execFileSync(
      "docker",
      ["exec", "postgres", "psql", "-U", "postgres", "-d",
       "ai_doc_intelligence", "-t", "-A", "-F", "", "-c", sql],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    console.warn("  (skipping --db: could not reach the postgres container)");
    return [];
  }
  return out
    .split("\n")
    .map((line) => line.split(""))
    .filter((parts) => parts.length === 2 && parts[1])
    .flatMap(([slug, json]) => {
      try {
        return [{ source: `db:${slug}`, config: JSON.parse(json) }];
      } catch (err) {
        return [{ source: `db:${slug}`, parseError: String(err) }];
      }
    });
}

/* ------------------------------------------------------------------- main */

const workflows = [...loadTemplates(), ...(useDb ? loadSeededDemos() : [])];
if (workflows.length === 0) {
  console.error("No workflows found.");
  process.exit(1);
}

const validate = loadValidator();
if (!validate) {
  console.warn(
    "  (validator unavailable — run `npm run build -w packages/graph-workflow`; " +
      "shape coverage still reported)",
  );
}

console.log(`\nLinting ${workflows.length} workflow document(s)\n`);

let invalid = 0;
for (const wf of workflows) {
  if (wf.parseError) {
    console.log(`  ✗ ${wf.source} — invalid JSON: ${wf.parseError}`);
    invalid++;
    continue;
  }
  if (!validate) continue;
  let result;
  try {
    result = validate(wf.config);
  } catch (err) {
    console.log(`  ✗ ${wf.source} — validator threw: ${err}`);
    invalid++;
    continue;
  }
  const errors = (result?.errors ?? []).filter((e) => e.severity !== "warning");
  if (errors.length > 0) {
    invalid++;
    console.log(`  ✗ ${wf.source}`);
    for (const e of errors.slice(0, 5)) {
      console.log(`      ${e.path} — ${e.message}`);
    }
    if (errors.length > 5) console.log(`      …and ${errors.length - 5} more`);
  }
}
if (validate && invalid === 0) console.log("  ✓ all documents valid\n");

/* --------------------------------------------------------- shape coverage */

console.log("Shape coverage across the collection\n");

const parsed = workflows.filter((w) => !w.parseError);
let missingRequired = 0;

for (const shape of SHAPES) {
  const holders = parsed.filter((w) => {
    try {
      return shape.test(w.config);
    } catch {
      return false;
    }
  });
  const n = holders.length;
  const mark = n > 0 ? "✓" : shape.required ? "✗" : "·";
  console.log(`  ${mark} ${String(n).padStart(3)}  ${shape.label}`);
  if (n === 0 && shape.required) {
    missingRequired++;
    console.log(`         GAP — ${shape.why}`);
  }
}

console.log("");
if (missingRequired > 0) {
  console.log(
    `${missingRequired} required shape(s) have no example. Any check written\n` +
      `against them passes regardless of what the code does. Add a workflow\n` +
      `with that shape rather than weakening the check.\n`,
  );
}

const failed = invalid > 0 || (strict && missingRequired > 0);
process.exit(failed ? 1 : 0);
