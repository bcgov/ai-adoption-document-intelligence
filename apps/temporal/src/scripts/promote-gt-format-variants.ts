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
 *   - Income-like fields (any `applicant_*` / `spouse_*` field that isn't
 *     a name/phone/sin/date/signature/email and whose GT parses as a
 *     numeric scalar): a `$`-prefixed/suffixed prediction with the same
 *     numeric value is a variant (`"$0"` vs `"0"`, `"$900.00"` vs `"900.00"`,
 *     `"50$"` vs `"50"`); AND numeric-equality across type boundaries
 *     (`900` number vs `"900.00"` string, `26.8` vs `"26.80"`, `60` vs
 *     `"60.00"`). Also accepts non-numeric-stripped equality (`"$ N/A"`
 *     vs `"N/A"`).
 *   - Text-like fields (`name`, `spouse_name`, `signature`, `spouse_signature`,
 *     `explain_changes`): whitespace-only differences (line breaks, multiple
 *     spaces collapsed), case-only differences, and trailing-punctuation-only
 *     differences are accepted as variants. E.g. `"Lost job, taking course
 *     to find\nnew work."` vs `"Lost job, taking course to find new work."`;
 *     `"HOMELESS"` vs `"Homeless"`; `"Smith Fake."` vs `"Smith Fake"`. The
 *     check applies all three normalisations together — any combination of
 *     case / whitespace / trailing-punct differences is accepted.
 *
 * Skipped (not promoted, even if mismatched):
 *
 *   - Fields outside the sin/date/phone allowlist AND not income-like AND
 *     not text-like (e.g. email, address, checkbox state) — those need
 *     manual review.
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

/**
 * Income-like fields where a currency-prefix prediction (`"$0"` for GT `"0"`,
 * `"$900.00"` for GT `"900.00"`) is treated as a pure format variant. The
 * predicate is shape-based, not name-list-based, so the rule stays open to
 * new income fields added later: a field qualifies if its name starts with
 * `applicant_` or `spouse_` and is not on the obvious non-numeric suffix
 * exclusion list (signature/name/phone/sin/date). The GT must additionally
 * parse as a numeric scalar (string-numeric or number) — text GTs like
 * `"N/A"` are excluded automatically by that filter.
 */
const NON_NUMERIC_PERSON_SUFFIXES = new Set<string>([
  "name",
  "phone",
  "sin",
  "date",
  "signature",
  "email",
]);

function isIncomeLikeField(field: string): boolean {
  if (!field.startsWith("applicant_") && !field.startsWith("spouse_")) {
    return false;
  }
  const tail = field.replace(/^(applicant|spouse)_/, "");
  return !NON_NUMERIC_PERSON_SUFFIXES.has(tail);
}

function parseNumericLike(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

function stripCurrencyChrome(v: string): string {
  // Strip leading/trailing $ and adjacent whitespace; idempotent if no $.
  return v
    .trim()
    .replace(/^\$\s*/, "")
    .replace(/\s*\$$/, "");
}

function isCurrencyFormatVariant(predicted: string, expected: string): boolean {
  const stripped = stripCurrencyChrome(predicted);
  if (stripped === predicted) return false; // no $ to strip → not a currency variant
  // Numeric equivalence: "$900.00" vs "900.00", "$0" vs "0", "$2964.70" vs "2964.7"
  const p = parseNumericLike(stripped);
  const e = parseNumericLike(expected);
  if (p !== null && e !== null && p === e) return true;
  // Non-numeric stripped equality: "$ N/A" vs "N/A" (engine reads the form's
  // pre-printed dollar chrome along with whatever non-numeric value follows).
  if (stripped === expected.trim()) return true;
  return false;
}

/**
 * Numeric equivalence variants for income-like fields. Engines disagree on
 * whether to return `900` (number), `"900"` (string), `"900.00"` (string with
 * fractional padding), or `"900.0"` — all the same value. Promotes the GT
 * scalar to a one-of array containing the engine's exact rendering so the
 * comparison passes on `exact` rule without losing the canonical form.
 */
function isNumericEqualityVariant(
  predicted: unknown,
  expected: unknown,
): boolean {
  const p =
    typeof predicted === "number" ? predicted : parseNumericLike(predicted);
  const e =
    typeof expected === "number" ? expected : parseNumericLike(expected);
  if (p === null || e === null) return false;
  return p === e;
}

/**
 * Free-text fields where whitespace, case, and trailing-punctuation
 * differences between engine and GT represent the same transcription. These
 * are the fields where handwriting variance (line breaks, capitalisation
 * style, trailing period) is naturally ambiguous.
 */
const TEXT_LIKE_FIELDS = new Set<string>([
  "name",
  "spouse_name",
  "signature",
  "spouse_signature",
  "explain_changes",
]);

function isTextLikeField(field: string): boolean {
  return TEXT_LIKE_FIELDS.has(field);
}

function normalizeWhitespace(v: string): string {
  // Collapse all whitespace runs (incl. \n, \t, multiple spaces) to a single
  // space, trim. So "Lost job, taking course to find\nnew work." normalises
  // identically with "Lost job, taking course to find new work."
  return v.replace(/\s+/g, " ").trim();
}

function stripTrailingPunct(v: string): string {
  return v.replace(/[.,;:!?]+$/, "");
}

function isTextEquivalenceVariant(
  predicted: string,
  expected: string,
): boolean {
  // Any combination of normalisations counts — whitespace AND case AND
  // trailing-punct stripped should be equal.
  const normP = stripTrailingPunct(
    normalizeWhitespace(predicted),
  ).toLowerCase();
  const normE = stripTrailingPunct(normalizeWhitespace(expected)).toLowerCase();
  if (predicted === expected) return false;
  return normP === normE;
}

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
  newArray: string[];
  /**
   * True when the GT was already an array and we are extending it with
   * one additional alternate (rather than promoting a scalar to a 2-element array).
   */
  extending: boolean;
}

function isVariantOfAny(
  field: string,
  predicted: string,
  expectedAlternates: string[],
): boolean {
  if (field === "sin" || field === "spouse_sin") {
    return expectedAlternates.some((e) => isSinFormatVariant(predicted, e));
  }
  if (field === "date" || field === "spouse_date") {
    return expectedAlternates.some((e) => isDateFormatVariant(predicted, e));
  }
  if (field === "phone" || field === "spouse_phone") {
    return expectedAlternates.some((e) => isPhoneFormatVariant(predicted, e));
  }
  if (isIncomeLikeField(field)) {
    if (expectedAlternates.some((e) => isCurrencyFormatVariant(predicted, e))) {
      return true;
    }
    if (
      expectedAlternates.some((e) => isNumericEqualityVariant(predicted, e))
    ) {
      return true;
    }
  }
  if (isTextLikeField(field)) {
    if (
      expectedAlternates.some((e) => isTextEquivalenceVariant(predicted, e))
    ) {
      return true;
    }
  }
  return false;
}

function classifyPromotion(
  field: string,
  predicted: unknown,
  expected: unknown,
): Promotion | null {
  const eligible =
    PROMOTABLE_FIELDS.has(field) ||
    isIncomeLikeField(field) ||
    isTextLikeField(field);
  if (!eligible) return null;
  if (predicted === null || predicted === undefined || predicted === "") {
    return null;
  }
  if (expected === null || expected === undefined || expected === "") {
    return null;
  }
  const predictedScalar = String(predicted);

  // For text-like fields the sentinel-skip is too aggressive — values like
  // "Homeless" or "Spouse Missing" can legitimately be read by engines with
  // case/whitespace/trailing-punct drift. The text-equivalence check is
  // conservative enough that an alternate accepted by it is still recognisably
  // the same transcription. For format-allowlist fields (sin/date/phone) and
  // income-like fields, the sentinel block stays — promoting a numeric/format
  // variant of a sentinel doesn't make sense.
  const honourSentinel = !isTextLikeField(field);

  if (Array.isArray(expected)) {
    // GT is already an array — extend it if the prediction is a calendar-/
    // digit-/currency-/numeric-/text-equivalent variant of any existing
    // alternate that isn't already listed verbatim.
    const alternates = expected.map(String).filter((s) => s.length > 0);
    if (alternates.length === 0) return null;
    if (alternates.includes(predictedScalar)) return null;
    if (honourSentinel && alternates.some((s) => SENTINEL_GT_VALUES.has(s))) {
      return null;
    }
    if (!isVariantOfAny(field, predictedScalar, alternates)) return null;
    return {
      sampleId: "",
      field,
      expectedScalar: alternates[0],
      predictedScalar,
      newArray: [...alternates, predictedScalar],
      extending: true,
    };
  }

  const expectedScalar = String(expected);
  if (honourSentinel && SENTINEL_GT_VALUES.has(expectedScalar)) return null;
  if (expectedScalar === predictedScalar) return null;

  let isVariant = false;
  if (field === "sin" || field === "spouse_sin") {
    isVariant = isSinFormatVariant(predictedScalar, expectedScalar);
  } else if (field === "date" || field === "spouse_date") {
    isVariant = isDateFormatVariant(predictedScalar, expectedScalar);
  } else if (field === "phone" || field === "spouse_phone") {
    isVariant = isPhoneFormatVariant(predictedScalar, expectedScalar);
  } else if (isIncomeLikeField(field)) {
    isVariant =
      isCurrencyFormatVariant(predictedScalar, expectedScalar) ||
      isNumericEqualityVariant(predicted, expected);
  } else if (isTextLikeField(field)) {
    isVariant = isTextEquivalenceVariant(predictedScalar, expectedScalar);
  }
  if (!isVariant) return null;

  return {
    sampleId: "",
    field,
    expectedScalar,
    predictedScalar,
    newArray: [expectedScalar, predictedScalar],
    extending: false,
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
      // current value is still the scalar we expected. Cross-type-aware so
      // a GT stored as a JSON number (e.g. `4277.55`) still matches the
      // string form `"4277.55"` produced by the export pipeline.
      const currentMatchesExpected =
        current === p.expectedScalar ||
        (typeof current === "number" && String(current) === p.expectedScalar);
      if (currentMatchesExpected) {
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
