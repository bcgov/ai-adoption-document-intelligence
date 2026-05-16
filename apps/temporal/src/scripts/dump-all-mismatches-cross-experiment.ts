/**
 * dump-all-mismatches-cross-experiment.ts
 *
 * Produces a single Markdown file at
 * `experiments/results/CROSS_EXPERIMENT_MISMATCHES.md` showing every
 * predicted/expected pair across ALL nine experiments' current
 * `benchmark-run.json` files, classified by technical-equivalence pattern.
 *
 * The intent is the cross-engine feedback loop: after running
 * `promote-gt-format-variants.ts` + `reevaluate-against-local-gt.ts` to
 * convergence, this dump shows what mismatches REMAIN. Inspect the
 * "technical-equivalence" classes for missed promotion patterns; the
 * "genuine-difference" class is the real engine error surface.
 *
 * Sections:
 *   1. Aggregate metrics table (one row per experiment)
 *   2. Classification summary (mismatch counts per equivalence class, per
 *      experiment)
 *   3. Per-experiment per-sample mismatch tables (linked from the index)
 *
 * Usage (from apps/temporal):
 *
 *   npx tsx -r tsconfig-paths/register \
 *     src/scripts/dump-all-mismatches-cross-experiment.ts
 *
 * No flags; reads every `experiments/results/<slug>/benchmark-run.json`
 * matching the canonical 9-experiment list. Pure data-munging; safe to
 * re-run at any time.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const EXPERIMENTS = [
  "00-doc-intelligence-template",
  "01-neural-doc-intelligence",
  "02-mistral-doc-ai-azure",
  "03-content-understanding",
  "04-vlm-direct",
  "05-vlm-ocr-hybrid",
  "06-engine-ensemble",
  "07-vlm-ocr-hybrid-gpt-4o",
  "08-vlm-ocr-hybrid-gpt-5.2",
];
const KNOWN_HARD = new Set<string>(["81 blank", "81 coffee"]);

interface EvalDetail {
  field: string;
  matched: boolean;
  predicted?: unknown;
  expected?: unknown;
}

interface SampleMetrics {
  f1?: number;
  precision?: number;
  recall?: number;
  matchedFields?: number;
  falsePositives?: number;
  falseNegatives?: number;
}

interface PerSample {
  sampleId: string;
  pass: boolean;
  metrics?: SampleMetrics;
  evaluationDetails?: EvalDetail[];
}

interface BenchmarkExport {
  run: { id: string; status: string };
  metrics: Record<string, number>;
  perSampleResults: PerSample[];
}

function parseNumericLike(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function classify(predicted: unknown, expected: unknown): string {
  const alts = Array.isArray(expected) ? expected : [expected];
  const pIsNull =
    predicted === null || predicted === undefined || predicted === "";
  const eAllNull = alts.every((a) => a === null || a === undefined || a === "");
  if (pIsNull && eAllNull) return "both-null";
  if (pIsNull) return "deletion";
  if (eAllNull) return "insertion";

  const pStr = String(predicted);

  // exact-string match (should not occur because matched=false, but defensive)
  if (alts.some((a) => String(a) === pStr)) return "exact-coerce-MATCH";

  // Numeric equivalence
  const pNum = parseNumericLike(predicted);
  if (pNum !== null) {
    for (const a of alts) {
      const aNum = parseNumericLike(a);
      if (aNum !== null && aNum === pNum) return "numeric-equal";
    }
  }

  // Currency-prefix
  const stripped = pStr
    .trim()
    .replace(/^\$\s*/, "")
    .replace(/\s*\$$/, "");
  if (stripped !== pStr.trim()) {
    const sNum = parseNumericLike(stripped);
    for (const a of alts) {
      const aNum = parseNumericLike(a);
      if (sNum !== null && aNum !== null && sNum === aNum)
        return "currency-numeric";
      if (stripped === String(a).trim()) return "currency-string";
    }
  }

  // Whitespace-only
  const normWs = (s: string) => s.replace(/\s+/g, " ").trim();
  if (alts.some((a) => normWs(String(a)) === normWs(pStr)))
    return "whitespace-only";

  // Case-only
  if (alts.some((a) => String(a).toLowerCase() === pStr.toLowerCase()))
    return "case-only";

  // Trailing-punct only
  const stripTP = (s: string) => s.replace(/[.,;:!?]+$/, "");
  if (alts.some((a) => stripTP(String(a)) === stripTP(pStr)))
    return "punctuation-only";

  // Combined text normalisation
  const fullNorm = (s: string) => stripTP(normWs(s)).toLowerCase();
  if (alts.some((a) => fullNorm(String(a)) === fullNorm(pStr)))
    return "text-combined";

  // Numeric prefix/suffix that's not just currency (e.g. ", *X*, units)
  // Punt to "genuine-diff" for these — not worth a separate class until
  // we see them in the data.
  return "genuine-diff";
}

const TECHNICAL_CLASSES = new Set<string>([
  "numeric-equal",
  "currency-numeric",
  "currency-string",
  "whitespace-only",
  "case-only",
  "punctuation-only",
  "text-combined",
  "exact-coerce-MATCH",
]);

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v === "" ? '""' : `"${v}"`;
  if (Array.isArray(v)) return "[" + v.map(fmt).join(", ") + "]";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ⏎ ");
}

function loadExport(slug: string): BenchmarkExport {
  const p = path.join(
    REPO_ROOT,
    "experiments",
    "results",
    slug,
    "benchmark-run.json",
  );
  return JSON.parse(fs.readFileSync(p, "utf-8")) as BenchmarkExport;
}

function main(): void {
  const lines: string[] = [];
  lines.push("# Cross-experiment mismatch dump");
  lines.push("");
  lines.push(
    `Generated by \`apps/temporal/src/scripts/dump-all-mismatches-cross-experiment.ts\` from each experiment's \`benchmark-run.json\` after running the canonical promote + reeval to convergence.`,
  );
  lines.push("");
  lines.push(
    "Use this as the feedback loop for GT-cleanup. The technical-equivalence classes (numeric-equal, currency-*, whitespace/case/punctuation/text-combined) SHOULD be empty — if any rows remain there, the promote-gt-format-variants rules need extending. The genuine-diff class is the real engine error surface.",
  );
  lines.push("");
  lines.push(
    `Known-hard samples (excluded from many narratives but listed inline): \`${[...KNOWN_HARD].join("`, `")}\`.`,
  );
  lines.push("");

  // Load all
  const exports: { slug: string; data: BenchmarkExport }[] = [];
  for (const slug of EXPERIMENTS) {
    exports.push({ slug, data: loadExport(slug) });
  }

  // 1. Aggregate metrics table
  lines.push("## 1. Aggregate metrics");
  lines.push("");
  lines.push(
    "| Experiment | pass_rate | f1.mean | f1.median | precision | recall | matched.median | FP.mean | FN.mean |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const { slug, data } of exports) {
    const m = data.metrics;
    lines.push(
      `| ${slug} | ${(m.pass_rate ?? 0).toFixed(3)} | ${(m["f1.mean"] ?? 0).toFixed(3)} | ${(m["f1.median"] ?? 0).toFixed(3)} | ${(m["precision.mean"] ?? 0).toFixed(3)} | ${(m["recall.mean"] ?? 0).toFixed(3)} | ${m["matchedFields.median"] ?? 0} | ${(m["falsePositives.mean"] ?? 0).toFixed(2)} | ${(m["falseNegatives.mean"] ?? 0).toFixed(2)} |`,
    );
  }
  lines.push("");

  // 2. Classification summary
  lines.push("## 2. Mismatch classification");
  lines.push("");
  lines.push(
    "Counts of unmatched (`matched: false`) `evaluationDetails` rows in each experiment, grouped by what kind of difference would explain them.",
  );
  lines.push("");
  const classOrder = [
    "numeric-equal",
    "currency-numeric",
    "currency-string",
    "whitespace-only",
    "case-only",
    "punctuation-only",
    "text-combined",
    "exact-coerce-MATCH",
    "deletion",
    "insertion",
    "genuine-diff",
  ];
  lines.push(`| Experiment | ${classOrder.join(" | ")} | total |`);
  lines.push(`|---|${classOrder.map(() => "---").join("|")}|---|`);
  const grand: Record<string, number> = {};
  for (const { slug, data } of exports) {
    const counts: Record<string, number> = {};
    for (const s of data.perSampleResults) {
      for (const e of s.evaluationDetails ?? []) {
        if (e.matched) continue;
        const c = classify(e.predicted, e.expected);
        counts[c] = (counts[c] || 0) + 1;
        grand[c] = (grand[c] || 0) + 1;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const row = classOrder.map((c) => counts[c] ?? 0).join(" | ");
    lines.push(`| ${slug} | ${row} | **${total}** |`);
  }
  const grandTotal = Object.values(grand).reduce((a, b) => a + b, 0);
  lines.push(
    `| **TOTAL** | ${classOrder.map((c) => `**${grand[c] ?? 0}**`).join(" | ")} | **${grandTotal}** |`,
  );
  lines.push("");

  // Any technical classes still populated?
  const techRemaining = classOrder
    .filter((c) => TECHNICAL_CLASSES.has(c))
    .reduce((sum, c) => sum + (grand[c] ?? 0), 0);
  if (techRemaining === 0) {
    lines.push(
      "**✓ All technical-equivalence classes are empty.** Every remaining mismatch is a real difference (deletion / insertion / genuine-diff). The promote-gt-format-variants rules cover every format-only pattern in the current data.",
    );
  } else {
    lines.push(
      `**⚠ ${techRemaining} mismatches remain in technical-equivalence classes.** These represent missed promotion patterns — extend \`promote-gt-format-variants.ts\` and re-run.`,
    );
  }
  lines.push("");

  // 3. Per-experiment per-sample tables
  lines.push("## 3. Per-experiment per-sample mismatches");
  lines.push("");
  for (const { slug, data } of exports) {
    lines.push(`### ${slug}`);
    lines.push("");
    const m = data.metrics;
    lines.push(
      `Run id \`${data.run.id}\`. pass_rate ${(m.pass_rate ?? 0).toFixed(3)}, f1.median ${(m["f1.median"] ?? 0).toFixed(3)}, matchedFields.median ${m["matchedFields.median"] ?? 0}.`,
    );
    lines.push("");

    const samples = [...data.perSampleResults]
      .filter((s) => s.evaluationDetails)
      .filter((s) => (s.evaluationDetails ?? []).some((e) => !e.matched))
      .sort((a, b) => (a.metrics?.f1 ?? 1) - (b.metrics?.f1 ?? 1));

    if (samples.length === 0) {
      lines.push("_No mismatches._");
      lines.push("");
      continue;
    }

    for (const s of samples) {
      const known = KNOWN_HARD.has(s.sampleId) ? " ⚠️ KNOWN-HARD" : "";
      const sm = s.metrics ?? {};
      const total =
        (sm.matchedFields ?? 0) +
        (sm.falseNegatives ?? 0) +
        (sm.falsePositives ?? 0);
      lines.push(`#### ${slug} — ${s.sampleId}${known}`);
      lines.push("");
      lines.push(
        `f1 **${(sm.f1 ?? 0).toFixed(3)}**, precision ${(sm.precision ?? 0).toFixed(3)}, recall ${(sm.recall ?? 0).toFixed(3)}, matched ${sm.matchedFields ?? 0} of ${total}, pass=\`${s.pass}\``,
      );
      lines.push("");
      lines.push("| field | predicted | expected | class |");
      lines.push("|---|---|---|---|");
      const misses = (s.evaluationDetails ?? []).filter((e) => !e.matched);
      for (const e of misses) {
        const c = classify(e.predicted, e.expected);
        const tag = TECHNICAL_CLASSES.has(c) ? `🔧 ${c}` : c;
        lines.push(
          `| \`${e.field}\` | ${escapeCell(fmt(e.predicted))} | ${escapeCell(fmt(e.expected))} | ${tag} |`,
        );
      }
      lines.push("");
    }
  }

  const outPath = path.join(
    REPO_ROOT,
    "experiments",
    "results",
    "CROSS_EXPERIMENT_MISMATCHES.md",
  );
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`✓ wrote ${outPath}`);
  console.log(`  grand total: ${grandTotal} mismatches across 9 experiments`);
  for (const c of classOrder) {
    if ((grand[c] ?? 0) > 0) {
      console.log(
        `  ${c}: ${grand[c]}${TECHNICAL_CLASSES.has(c) ? " 🔧" : ""}`,
      );
    }
  }
  if (techRemaining > 0) {
    process.exitCode = 1;
  }
}

main();
