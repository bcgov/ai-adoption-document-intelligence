/**
 * dump-errors-for-gt-cleanup.ts
 *
 * Generates `experiments/results/<slug>/iteration/errors-for-gt-cleanup.md`
 * from `experiments/results/<slug>/benchmark-run.json` — a per-sample dump of
 * every field where the engine prediction did NOT exactly match the current
 * ground truth. Sorted by ascending F1 so the worst samples land at the top.
 *
 * The output is the working file for the dataset-cleanup pass that follows
 * each round of prompt iteration: each row pairs `predicted` (what the engine
 * read on the form) with `expected` (the current GT). For pure
 * format-variants (date / SIN / phone / etc.) the GT can be promoted to a
 * one-of array `["original", "predicted-variant"]` using the
 * schema-aware-evaluator's array-GT support — see [E02 SUMMARY § One-of GT
 * support](experiments/results/02-mistral-doc-ai-azure/SUMMARY.md#one-of-gt-support-evaluator-change).
 * Genuine engine misreads (P↔F, S↔J, sentinel labels never on the form, etc.)
 * are listed but flagged as non-GT-fixable.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register \
 *     scripts/dump-errors-for-gt-cleanup.ts <slug>
 *
 *   slug examples: 01-neural-doc-intelligence, 02-mistral-doc-ai-azure,
 *                  03-content-understanding, 04-vlm-direct, 05-vlm-ocr-hybrid
 *
 *   Optional flags:
 *     --known-hard "<id>[,<id>...]"  — sample IDs to tag ⚠️ KNOWN-HARD
 *                                       (defaults to "81 blank,81 coffee" for the
 *                                       SDPR samples-mix dataset; pass empty
 *                                       string to disable)
 *     --out <path>                   — override output path (default:
 *                                       experiments/results/<slug>/iteration/errors-for-gt-cleanup.md)
 *
 * Examples:
 *   # E02 with defaults (uses SDPR known-hard pair)
 *   npx tsx -r tsconfig-paths/register scripts/dump-errors-for-gt-cleanup.ts 02-mistral-doc-ai-azure
 *
 *   # E03 with no known-hard exclusions
 *   npx tsx -r tsconfig-paths/register scripts/dump-errors-for-gt-cleanup.ts 03-content-understanding --known-hard ""
 *
 * The script is pure data-munging — it does not load env, hit the DB, or
 * make any network calls. Safe to run any time after a benchmark export
 * lands.
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface EvalDetail {
  field: string;
  matched: boolean;
  predicted?: unknown;
  expected?: unknown;
  similarity?: number;
}

interface PerSample {
  sampleId: string;
  pass: boolean;
  metrics: {
    f1?: number;
    precision?: number;
    recall?: number;
    matchedFields?: number;
    falseNegatives?: number;
    falsePositives?: number;
  };
  evaluationDetails: EvalDetail[];
}

interface BenchmarkExport {
  run: { id: string; status: string };
  metrics: {
    pass_rate?: number;
    "f1.median"?: number;
    "f1.mean"?: number;
    "matchedFields.median"?: number;
    passing_samples?: number;
    total_samples?: number;
  };
  perSampleResults: PerSample[];
}

interface ParsedArgs {
  slug: string;
  knownHard: Set<string>;
  outPath: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length === 0 || args[0]?.startsWith("--")) {
    throw new Error(
      'Usage: dump-errors-for-gt-cleanup.ts <slug> [--known-hard "id1,id2"] [--out <path>]',
    );
  }
  const slug = args[0];
  let knownHardRaw: string | undefined;
  let outOverride: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === "--known-hard") {
      knownHardRaw = value;
      i++;
    } else if (flag === "--out") {
      outOverride = value;
      i++;
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  // Default known-hard set: the SDPR samples-mix pair documented in every
  // experiment's iteration framing. Pass --known-hard "" to disable.
  const defaultKnownHard = "81 blank,81 coffee";
  const effectiveKnownHardRaw = knownHardRaw ?? defaultKnownHard;
  const knownHard = new Set(
    effectiveKnownHardRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const defaultOut = path.join(
    repoRoot,
    "experiments",
    "results",
    slug,
    "iteration",
    "errors-for-gt-cleanup.md",
  );
  const outPath = outOverride ? path.resolve(outOverride) : defaultOut;

  return { slug, knownHard, outPath };
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v === "" ? '""' : `"${v}"`;
  if (Array.isArray(v)) {
    return "[" + v.map((x) => fmt(x)).join(", ") + "]";
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function loadExport(slug: string): {
  exportPath: string;
  data: BenchmarkExport;
} {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const exportPath = path.join(
    repoRoot,
    "experiments",
    "results",
    slug,
    "benchmark-run.json",
  );
  if (!fs.existsSync(exportPath)) {
    throw new Error(
      `Benchmark export not found: ${exportPath}\n` +
        `Run the experiment first: trigger-experiment-benchmark.ts ${slug} then ` +
        `poll-experiment-run.ts <runId> ${slug}.`,
    );
  }
  return {
    exportPath,
    data: JSON.parse(fs.readFileSync(exportPath, "utf-8")) as BenchmarkExport,
  };
}

function writeReport(args: {
  slug: string;
  exportPath: string;
  data: BenchmarkExport;
  knownHard: Set<string>;
  outPath: string;
}): { listed: number; sampleCount: number } {
  const { slug, exportPath, data, knownHard, outPath } = args;
  const run = data.run;
  const metrics = data.metrics ?? {};
  const samples = [...data.perSampleResults].sort(
    (a, b) => (a.metrics.f1 ?? 0) - (b.metrics.f1 ?? 0),
  );

  const passRate = metrics.pass_rate ?? 0;
  const f1Median = metrics["f1.median"] ?? 0;
  const f1Mean = metrics["f1.mean"] ?? 0;
  const matchedMedian = metrics["matchedFields.median"] ?? 0;
  const passing = metrics.passing_samples ?? 0;
  const total = metrics.total_samples ?? samples.length;

  const lines: string[] = [];
  lines.push(`# ${slug} — mismatches per sample (for GT cleanup)`);
  lines.push("");
  lines.push(
    `Run id: \`${run.id}\`  •  status: \`${run.status}\`  •  generated by \`apps/temporal/scripts/dump-errors-for-gt-cleanup.ts\` from \`${path.relative(path.resolve(__dirname, "..", "..", ".."), exportPath)}\`.`,
  );
  lines.push("");
  lines.push(
    `Aggregate: pass_rate **${passRate.toFixed(3)}** (${passing}/${total}), f1.median **${f1Median.toFixed(3)}**, f1.mean **${f1Mean.toFixed(3)}**, matchedFields.median **${matchedMedian}**.`,
  );
  lines.push("");
  lines.push(
    "Each sample lists every field where the engine prediction did NOT exactly match the current GT, sorted by ascending f1 (worst at top). For each row:",
  );
  lines.push("");
  lines.push(
    "- `predicted` is what the engine returned (i.e. what is *actually written / drawn on the form*, modulo any engine-OCR misreads we know it makes).",
  );
  lines.push(
    `- \`expected\` is the **current GT** for that field. Edit the GT JSON in \`data/datasets/<dataset-folder>/<visibility>/<sample>.json\` if \`predicted\` matches the form better.`,
  );
  lines.push(
    '- **Alternative GT support is available**: a GT field value can be an array of acceptable scalars (one-of), e.g. `"date": ["2026-APR-15", "2026-04-15"]`. The evaluator accepts any element. Use this for ambiguous fields where multiple form-faithful renderings are acceptable (date format, SIN with/without hyphens, etc.). See `apps/temporal/src/evaluators/schema-aware-evaluator.ts` for the supported rules (exact / fuzzy / numeric / date / boolean all honour array GT).',
  );
  lines.push("");
  if (knownHard.size > 0) {
    lines.push(
      `**Known-hard samples (tagged ⚠️ KNOWN-HARD; mismatches listed but excluded from iteration):** ${[...knownHard].map((s) => `\`${s}\``).join(", ")}.`,
    );
    lines.push("");
  }
  lines.push("---");
  lines.push("");

  let listed = 0;
  let sampleCount = 0;
  for (const s of samples) {
    const sid = s.sampleId;
    const sm = s.metrics ?? {};
    const misses = (s.evaluationDetails ?? []).filter((e) => !e.matched);
    if (misses.length === 0) continue;
    sampleCount += 1;
    const flag = knownHard.has(sid) ? " ⚠️ KNOWN-HARD" : "";
    const total =
      (sm.matchedFields ?? 0) +
      (sm.falseNegatives ?? 0) +
      (sm.falsePositives ?? 0);
    lines.push(`## ${sid}${flag}`);
    lines.push("");
    lines.push(
      `f1 **${(sm.f1 ?? 0).toFixed(3)}**, precision ${(sm.precision ?? 0).toFixed(3)}, recall ${(sm.recall ?? 0).toFixed(3)}, matched ${sm.matchedFields ?? 0} of ${total}, pass=\`${s.pass}\``,
    );
    lines.push("");
    lines.push(
      "| field_key | predicted (engine, on the form) | expected (current GT) |",
    );
    lines.push("|---|---|---|");
    for (const e of misses) {
      const fk = e.field;
      const pf = escapeTableCell(fmt(e.predicted));
      const xf = escapeTableCell(fmt(e.expected));
      lines.push(`| \`${fk}\` | ${pf} | ${xf} |`);
      listed += 1;
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(
    `**Total mismatches listed: ${listed} across ${sampleCount} samples**${knownHard.size > 0 ? ` (${knownHard.size} known-hard samples flagged inline)` : ""}.`,
  );
  lines.push("");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));
  return { listed, sampleCount };
}

function main(): void {
  const args = parseArgs(process.argv);
  const { exportPath, data } = loadExport(args.slug);
  const { listed, sampleCount } = writeReport({
    slug: args.slug,
    exportPath,
    data,
    knownHard: args.knownHard,
    outPath: args.outPath,
  });
  console.log(`✓ wrote ${args.outPath}`);
  console.log(`  ${listed} mismatches across ${sampleCount} samples`);
}

main();
