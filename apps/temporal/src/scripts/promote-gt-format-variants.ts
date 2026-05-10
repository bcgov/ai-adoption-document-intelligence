/**
 * promote-gt-format-variants.ts
 *
 * Auto-promotes GT scalar values to one-of arrays where the engine's
 * prediction differs from the GT only by FORMAT, not by content. Reads
 * `experiments/results/<slug>/benchmark-run.json` and writes the GT JSON
 * files in `data/datasets/<dataset-folder>/<visibility>/` in place.
 *
 * What counts as a "pure format variant":
 *
 *   - `sin` / `spouse_sin`: the digit sequence (after stripping spaces,
 *     hyphens, dots) is identical. E.g. `"999-888-777"` and `"999888777"`
 *     are variants of the same SIN; `"999-888-787"` is NOT — different
 *     digits, presumed engine misread.
 *   - `date` / `spouse_date`: both values parse to the same calendar date
 *     under the form-normalization parser (`parseToCalendarParts`). E.g.
 *     `"2026-Mar-16"` and `"2026-03-16"` are variants; `"2026-25-07"` and
 *     `"2026-07-25"` are NOT — different days (digit reordering on a
 *     synthetic format).
 *   - `phone` / `spouse_phone`: digit-only forms are identical. E.g.
 *     `"(555) 123-4567"` and `"5551234567"` are variants.
 *
 * Skipped (not promoted, even if mismatched):
 *
 *   - Fields outside the sin/date/phone allowlist (e.g. signature, name,
 *     income amounts) — those need manual review.
 *   - Sentinel labels in GT (`":present:"`, `":garbled:"`,
 *     `"KEY PLAYER MISSING"`, `"Spouse Missing"`, `"Missed Box"`,
 *     `"Blank Declaration"`, `"Homeless"`) — these were never on the
 *     form and cannot be predicted by any engine. Listed in the
 *     skip-set below.
 *   - Mismatches where the prediction or expected is null-like — the
 *     evaluator already handles those.
 *   - Mismatches where the digits / calendar-date check FAILS — those
 *     are genuine engine misreads, not format variants.
 *
 * Usage (from apps/temporal):
 *
 *   # Dry-run by default — lists what WOULD be promoted, doesn't write files.
 *   npx tsx -r tsconfig-paths/register \
 *     src/scripts/promote-gt-format-variants.ts <slug>
 *
 *   # Pass --write to actually update the GT JSON files.
 *   npx tsx -r tsconfig-paths/register \
 *     src/scripts/promote-gt-format-variants.ts <slug> --write
 *
 *   # Override the dataset folder (default detects from the workflow JSON's
 *   # metadata.targetLocalDataset, falling back to samples-mix/public).
 *   npx tsx -r tsconfig-paths/register \
 *     src/scripts/promote-gt-format-variants.ts <slug> --write \
 *     --dataset-dir data/datasets/samples-mix/public
 *
 * Safety:
 *
 *   - Idempotent: re-running after a promotion will see the GT is now an
 *     array containing the engine's prediction, the field will then match,
 *     and there will be no further promotion.
 *   - Per-field allowlist: the script will refuse to touch fields outside
 *     {sin, spouse_sin, date, spouse_date, phone, spouse_phone}.
 *   - Per-sample report printed before writing — review the dry-run output
 *     before passing --write.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseToCalendarParts } from "../form-field-normalization";

const PROMOTABLE_FIELDS = new Set<string>([
  "sin",
  "spouse_sin",
  "date",
  "spouse_date",
  "phone",
  "spouse_phone",
]);

const SENTINEL_GT_VALUES = new Set<string>([
  ":present:",
  ":garbled:",
  "KEY PLAYER MISSING",
  "Spouse Missing",
  "Missed Box",
  "Blank Declaration",
  "Homeless",
]);

interface EvalDetail {
  field: string;
  matched: boolean;
  predicted?: unknown;
  expected?: unknown;
}

interface PerSample {
  sampleId: string;
  evaluationDetails: EvalDetail[];
}

interface BenchmarkExport {
  perSampleResults: PerSample[];
}

interface WorkflowMeta {
  metadata?: {
    targetLocalDataset?: string;
  };
}

interface ParsedArgs {
  slug: string;
  datasetDir: string;
  write: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length === 0 || args[0]?.startsWith("--")) {
    throw new Error(
      "Usage: promote-gt-format-variants.ts <slug> [--write] [--dataset-dir <path>]",
    );
  }
  const slug = args[0];
  let write = false;
  let datasetDirOverride: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--write") {
      write = true;
    } else if (flag === "--dataset-dir") {
      datasetDirOverride = args[i + 1];
      i++;
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

  // Resolve dataset dir from the workflow JSON's metadata.targetLocalDataset
  // (format "<folder>-<visibility>"), falling back to samples-mix/public if
  // the JSON or field is missing. Override with --dataset-dir.
  let datasetDir: string;
  if (datasetDirOverride) {
    datasetDir = path.resolve(datasetDirOverride);
  } else {
    const workflowPath = path.join(
      repoRoot,
      "docs-md",
      "graph-workflows",
      "templates",
      `experiment-${slug}-workflow.json`,
    );
    let folder = "samples-mix";
    let visibility = "public";
    if (fs.existsSync(workflowPath)) {
      const wf = JSON.parse(
        fs.readFileSync(workflowPath, "utf-8"),
      ) as WorkflowMeta;
      const target = wf.metadata?.targetLocalDataset;
      if (target) {
        const lastDash = target.lastIndexOf("-");
        if (lastDash > 0) {
          folder = target.slice(0, lastDash);
          visibility = target.slice(lastDash + 1);
        }
      }
    }
    datasetDir = path.join(repoRoot, "data", "datasets", folder, visibility);
  }
  if (!fs.existsSync(datasetDir)) {
    throw new Error(`Dataset directory not found: ${datasetDir}`);
  }

  return { slug, datasetDir, write };
}

function loadExport(slug: string): BenchmarkExport {
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const exportPath = path.join(
    repoRoot,
    "experiments",
    "results",
    slug,
    "benchmark-run.json",
  );
  if (!fs.existsSync(exportPath)) {
    throw new Error(`Benchmark export not found: ${exportPath}`);
  }
  return JSON.parse(fs.readFileSync(exportPath, "utf-8")) as BenchmarkExport;
}

function digitsOnly(v: string): string {
  return v.replace(/[^0-9]/g, "");
}

function isSinFormatVariant(predicted: string, expected: string): boolean {
  const pd = digitsOnly(predicted);
  const xd = digitsOnly(expected);
  return pd.length > 0 && pd === xd;
}

function isPhoneFormatVariant(predicted: string, expected: string): boolean {
  const pd = digitsOnly(predicted);
  const xd = digitsOnly(expected);
  return pd.length > 0 && pd === xd;
}

function isDateFormatVariant(predicted: string, expected: string): boolean {
  const p = parseToCalendarParts(predicted);
  const e = parseToCalendarParts(expected);
  if (p === null || e === null) return false;
  return p.y === e.y && p.m === e.m && p.day === e.day;
}

interface Promotion {
  sampleId: string;
  field: string;
  expectedScalar: string;
  predictedScalar: string;
  newArray: [string, string];
}

function classifyPromotion(
  field: string,
  predicted: unknown,
  expected: unknown,
): Promotion | null {
  if (!PROMOTABLE_FIELDS.has(field)) return null;
  if (predicted === null || predicted === undefined || predicted === "") {
    return null;
  }
  if (expected === null || expected === undefined || expected === "") {
    return null;
  }
  // Already a one-of array — skip.
  if (Array.isArray(expected)) return null;
  const expectedScalar = String(expected);
  const predictedScalar = String(predicted);
  if (SENTINEL_GT_VALUES.has(expectedScalar)) return null;
  if (expectedScalar === predictedScalar) return null;

  let isVariant = false;
  if (field === "sin" || field === "spouse_sin") {
    isVariant = isSinFormatVariant(predictedScalar, expectedScalar);
  } else if (field === "date" || field === "spouse_date") {
    isVariant = isDateFormatVariant(predictedScalar, expectedScalar);
  } else if (field === "phone" || field === "spouse_phone") {
    isVariant = isPhoneFormatVariant(predictedScalar, expectedScalar);
  }
  if (!isVariant) return null;

  return {
    sampleId: "",
    field,
    expectedScalar,
    predictedScalar,
    newArray: [expectedScalar, predictedScalar],
  };
}

function gtFilePath(datasetDir: string, sampleId: string): string {
  return path.join(datasetDir, `${sampleId}.json`);
}

function main(): void {
  const args = parseArgs(process.argv);
  const data = loadExport(args.slug);

  // Collect all candidate promotions.
  const promotions: Promotion[] = [];
  for (const s of data.perSampleResults) {
    for (const e of s.evaluationDetails ?? []) {
      if (e.matched) continue;
      const p = classifyPromotion(e.field, e.predicted, e.expected);
      if (p === null) continue;
      promotions.push({ ...p, sampleId: s.sampleId });
    }
  }

  if (promotions.length === 0) {
    console.log("No format-variant promotions detected.");
    return;
  }

  // Group by sample for the report.
  const bySample = new Map<string, Promotion[]>();
  for (const p of promotions) {
    const list = bySample.get(p.sampleId) ?? [];
    list.push(p);
    bySample.set(p.sampleId, list);
  }

  console.log(
    `${args.write ? "Applying" : "DRY RUN (use --write to apply):"} ${promotions.length} format-variant promotion${promotions.length === 1 ? "" : "s"} across ${bySample.size} sample${bySample.size === 1 ? "" : "s"} in ${args.datasetDir}`,
  );
  console.log();

  let written = 0;
  for (const [sampleId, list] of bySample) {
    const filePath = gtFilePath(args.datasetDir, sampleId);
    if (!fs.existsSync(filePath)) {
      console.log(`  ! ${sampleId}: GT file missing (${filePath}) — SKIP`);
      continue;
    }
    console.log(`  ${sampleId}:`);
    for (const p of list) {
      console.log(
        `    ${p.field}: ${JSON.stringify(p.expectedScalar)} → ${JSON.stringify(p.newArray)} (engine read: ${JSON.stringify(p.predictedScalar)})`,
      );
    }
    if (!args.write) continue;

    const gt = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
      string,
      unknown
    >;
    let changed = false;
    for (const p of list) {
      const current = gt[p.field];
      // Re-check at write time to handle stale exports: only update if the
      // current value is still the scalar we expected.
      if (current === p.expectedScalar) {
        gt[p.field] = p.newArray;
        changed = true;
      } else if (Array.isArray(current)) {
        // Already an array — append the engine variant if not present.
        const arr = current as string[];
        if (!arr.includes(p.predictedScalar)) {
          arr.push(p.predictedScalar);
          gt[p.field] = arr;
          changed = true;
        }
      } else {
        console.log(
          `      (skip: ${p.field} on disk is ${JSON.stringify(current)}, not ${JSON.stringify(p.expectedScalar)} — re-run dump-errors-for-gt-cleanup against a fresh benchmark export)`,
        );
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, `${JSON.stringify(gt, null, 4)}\n`);
      written++;
    }
  }

  if (args.write) {
    console.log();
    console.log(`✓ wrote ${written} GT file${written === 1 ? "" : "s"}.`);
    console.log(
      "Next: run npm run test:db:reset, restart backend with FORCE_RESYNC_LOCAL_DATASETS=true to re-upload the updated GT, then trigger the benchmark again to verify recovery.",
    );
  } else {
    console.log();
    console.log(
      "Re-run with --write to apply. (Idempotent: re-running on already-promoted GTs is a no-op.)",
    );
  }
}

main();
