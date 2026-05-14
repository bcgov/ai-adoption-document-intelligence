#!/usr/bin/env node
/**
 * Benchmark run analysis report.
 *
 * Reads a downloaded benchmark export from ./drop and writes a markdown
 * summary into ./output. Both folders are gitignored.
 *
 * Defaults:
 *   input  = ./drop/<single .json file in drop/>  (or ./drop/sample.json)
 *   output = ./output/<input-basename>.md
 *
 * Usage:
 *   node analyze.js [input.json] [output.md]
 *
 * Recomputes overall metrics from `perFieldResults` so that field rows
 * edited by hand are reflected in the summary, and uses `perSampleResults`
 * to compute confidence-threshold trade-offs at 100% / 80% error capture.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const dropDir = path.join(__dirname, "drop");
const outputDir = path.join(__dirname, "output");

function resolveInputPath() {
  if (process.argv[2]) return process.argv[2];
  // If exactly one .json file sits in ./drop, use it; otherwise fall back
  // to ./drop/sample.json so the user knows the expected name.
  if (fs.existsSync(dropDir)) {
    const jsons = fs
      .readdirSync(dropDir)
      .filter((n) => n.toLowerCase().endsWith(".json"));
    if (jsons.length === 1) return path.join(dropDir, jsons[0]);
  }
  return path.join(dropDir, "sample.json");
}

const inputPath = resolveInputPath();
const outputPath =
  process.argv[3] ||
  path.join(
    outputDir,
    `${path.basename(inputPath, path.extname(inputPath))}.md`,
  );

if (!fs.existsSync(inputPath)) {
  console.error(
    `Input file not found: ${inputPath}\n` +
      `Place a downloaded benchmark export in ./drop/ (filename ending in .json).`,
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

// ---------------------------------------------------------------------------
// Per-sample → per-field instance index (so we have every confidence value,
// not just averages and error confidences).
// ---------------------------------------------------------------------------

/** @typedef {{ confidence: number | null, matched: boolean, sampleId: string }} Instance */

/** @type {Map<string, Instance[]>} */
const instancesByField = new Map();
for (const sample of data.perSampleResults || []) {
  const details = Array.isArray(sample.evaluationDetails)
    ? sample.evaluationDetails
    : [];
  for (const d of details) {
    if (!d || typeof d.field !== "string") continue;
    if (!instancesByField.has(d.field)) instancesByField.set(d.field, []);
    instancesByField.get(d.field).push({
      confidence: typeof d.confidence === "number" ? d.confidence : null,
      matched: d.matched === true,
      sampleId: sample.sampleId,
    });
  }
}

// ---------------------------------------------------------------------------
// Threshold analysis. Gate semantics match the backend
// (`flagged := confidence < threshold`), so to flag a value c we need
// threshold > c. We sweep candidate thresholds and pick the smallest that
// catches the target fraction of errors.
// ---------------------------------------------------------------------------

/**
 * @param {Instance[]} instances
 * @param {number} targetRecall  Fraction of errors to catch (0..1).
 * @returns {null | { threshold: number, errorsCaught: number, errorsTotal: number, falsePositives: number, correctTotal: number, evaluableTotal: number, unrankable: boolean }}
 */
function thresholdForRecall(instances, targetRecall) {
  const evaluable = instances.filter((i) => typeof i.confidence === "number");
  const errors = evaluable.filter((i) => !i.matched).map((i) => i.confidence);
  const correct = evaluable.filter((i) => i.matched).map((i) => i.confidence);

  if (errors.length === 0) return null;

  const targetCount = Math.ceil(errors.length * targetRecall);
  const sortedErrors = [...errors].sort((a, b) => a - b);
  // The `targetCount`-th smallest error confidence is the highest one we need
  // to catch. Threshold must be strictly greater than that value.
  const cutoff = sortedErrors[targetCount - 1];
  const threshold = cutoff + Number.EPSILON;
  const falsePositives = correct.filter((c) => c < threshold).length;

  // If correct predictions overlap or sit below errors in confidence space,
  // the gate cannot cleanly separate them — flag for the reader.
  const minCorrect = correct.length > 0 ? Math.min(...correct) : Infinity;
  const maxError = sortedErrors[sortedErrors.length - 1];
  const unrankable = correct.length > 0 && minCorrect <= maxError;

  // Display the threshold as the smallest 0.01-rounded value that still
  // catches the target — easier to read than 0.78 + ε.
  const displayThreshold = roundUpToStep(cutoff, 0.01);

  return {
    threshold: displayThreshold,
    errorsCaught: errors.filter((c) => c < threshold).length,
    errorsTotal: errors.length,
    falsePositives,
    correctTotal: correct.length,
    evaluableTotal: evaluable.length,
    unrankable,
  };
}

function roundUpToStep(value, step) {
  // Smallest multiple of `step` that is strictly greater than `value`. Using
  // < gate semantics: threshold = roundUp ensures every value ≤ original is
  // flagged.
  const stepped = Math.ceil((value + 1e-9) / step) * step;
  return Math.round(stepped * 100) / 100;
}

// ---------------------------------------------------------------------------
// Recompute overall metrics from perFieldResults.
// ---------------------------------------------------------------------------

const perField = data.perFieldResults || [];

const totalEvaluations = perField.reduce((s, f) => s + f.evaluatedCount, 0);
const totalCorrect = perField.reduce((s, f) => s + f.correctCount, 0);
const totalErrors = perField.reduce((s, f) => s + f.errorCount, 0);
const microAccuracy = totalEvaluations === 0 ? 0 : totalCorrect / totalEvaluations;
const microErrorRate = totalEvaluations === 0 ? 0 : totalErrors / totalEvaluations;
const macroAccuracy =
  perField.length === 0
    ? 0
    : perField.reduce((s, f) => s + f.accuracy, 0) / perField.length;

const fieldsWithErrors = perField.filter((f) => f.errorCount > 0);
const perfectFields = perField.filter((f) => f.errorCount === 0);

const sortedByErrorRate = [...perField].sort((a, b) => b.errorRate - a.errorRate);

// ---------------------------------------------------------------------------
// Run-level summary (only the genuinely critical bits).
// ---------------------------------------------------------------------------

const run = data.run || {};
const sampleCount = (data.perSampleResults || []).length;
const passingSamples = (data.perSampleResults || []).filter((s) => s.pass).length;
const failingSamples = sampleCount - passingSamples;

let durationLabel = "n/a";
if (run.startedAt && run.completedAt) {
  const ms = new Date(run.completedAt) - new Date(run.startedAt);
  if (ms >= 0) {
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    durationLabel = m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
}

// ---------------------------------------------------------------------------
// Error type classification + cross-field error correlation.
// Errors come from `perFieldResults[*].errors[]`; each entry carries the
// `predicted` and `expected` values. Classifying by emptiness on each side
// separates the three distinct failure modes — extraction failure (missing),
// hallucination / over-extraction (extra), and value-level errors (wrong) —
// each of which usually has a different root cause.
// ---------------------------------------------------------------------------

function isEmptyValue(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/**
 * @param {unknown} expected
 * @param {unknown} predicted
 * @returns {"missing" | "extra" | "wrong"}
 */
function classifyError(expected, predicted) {
  const expEmpty = isEmptyValue(expected);
  const predEmpty = isEmptyValue(predicted);
  if (!expEmpty && predEmpty) return "missing";
  if (expEmpty && !predEmpty) return "extra";
  return "wrong"; // both populated → value mismatch (or both empty edge case)
}

/** @type {Map<string, { missing: number, extra: number, wrong: number }>} */
const breakdownByField = new Map();
/** @type {Map<string, Array<{ field: string, kind: "missing" | "extra" | "wrong" }>>} sampleId → failed fields */
const errorsBySample = new Map();
let totalMissing = 0;
let totalExtra = 0;
let totalWrong = 0;

for (const f of data.perFieldResults || []) {
  let m = 0;
  let x = 0;
  let w = 0;
  for (const e of f.errors || []) {
    const kind = classifyError(e.expected, e.predicted);
    if (kind === "missing") {
      m++;
      totalMissing++;
    } else if (kind === "extra") {
      x++;
      totalExtra++;
    } else {
      w++;
      totalWrong++;
    }
    if (typeof e.sampleId === "string") {
      if (!errorsBySample.has(e.sampleId)) errorsBySample.set(e.sampleId, []);
      errorsBySample.get(e.sampleId).push({ field: f.name, kind });
    }
  }
  if (m + x + w > 0) {
    breakdownByField.set(f.name, { missing: m, extra: x, wrong: w });
  }
}
const totalClassifiedErrors = totalMissing + totalExtra + totalWrong;

// Co-occurrence: pairs of fields that failed together in the same sample.
/** @type {Map<string, number>} `${fieldA}||${fieldB}` (alphabetical) → count of samples */
const cooccurrenceCounts = new Map();
for (const failed of errorsBySample.values()) {
  const uniqueFields = [...new Set(failed.map((x) => x.field))].sort();
  for (let i = 0; i < uniqueFields.length; i++) {
    for (let j = i + 1; j < uniqueFields.length; j++) {
      const key = `${uniqueFields[i]}||${uniqueFields[j]}`;
      cooccurrenceCounts.set(key, (cooccurrenceCounts.get(key) || 0) + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown output.
// ---------------------------------------------------------------------------

const lines = [];
const fmtPct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const fmtNum = (v, digits = 3) =>
  typeof v === "number" ? v.toFixed(digits) : "—";
const fmtConf = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

lines.push(`# Benchmark Run Analysis`);
lines.push("");
lines.push(`Generated from \`${path.basename(inputPath)}\` on ${new Date().toISOString()}.`);
lines.push("");

// --- Run summary ---
lines.push(`## Run`);
lines.push("");
lines.push(`| Property | Value |`);
lines.push(`| --- | --- |`);
lines.push(`| Definition | ${run.definitionName ?? "—"} |`);
lines.push(`| Run ID | \`${run.id ?? "—"}\` |`);
lines.push(`| Status | ${run.status ?? "—"} |`);
lines.push(`| Started | ${run.startedAt ?? "—"} |`);
lines.push(`| Completed | ${run.completedAt ?? "—"} |`);
lines.push(`| Duration | ${durationLabel} |`);
lines.push(`| Samples (passed / failed) | ${sampleCount} (${passingSamples} / ${failingSamples}) |`);
if (run.error) lines.push(`| Run error | \`${run.error}\` |`);
lines.push("");

// --- Recomputed overall metrics ---
lines.push(`## Overall (recomputed from perFieldResults)`);
lines.push("");
lines.push(`| Metric | Value |`);
lines.push(`| --- | --- |`);
lines.push(`| Fields total | ${perField.length} |`);
lines.push(`| Fields with errors | ${fieldsWithErrors.length} |`);
lines.push(`| Fields perfect (0 errors) | ${perfectFields.length} |`);
lines.push(`| Total field evaluations | ${totalEvaluations} |`);
lines.push(`| Total correct | ${totalCorrect} |`);
lines.push(`| Total errors | ${totalErrors} |`);
lines.push(`| Micro accuracy (instance-weighted) | ${fmtPct(microAccuracy)} |`);
lines.push(`| Micro error rate | ${fmtPct(microErrorRate)} |`);
lines.push(`| Macro accuracy (field-weighted) | ${fmtPct(macroAccuracy)} |`);
lines.push("");
if (perField.length > 0) {
  lines.push(
    `> Macro accuracy treats every field equally regardless of how many ` +
      `instances each has; micro accuracy weights by instance count. The ` +
      `gap between them tells you whether errors concentrate in a few ` +
      `fields (large gap) or spread evenly (small gap).`,
  );
  lines.push("");
}

// --- Per-field table ---
lines.push(`## Per-field results`);
lines.push("");
lines.push(`Sorted by error rate (worst first). Confidence values are 0–1.`);
lines.push("");
lines.push(
  `| Field | Evaluated | Errors | Error rate | Avg conf | Avg conf (correct) | Avg conf (errors) |`,
);
lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
for (const f of sortedByErrorRate) {
  lines.push(
    `| \`${f.name}\` | ${f.evaluatedCount} | ${f.errorCount} | ${fmtPct(f.errorRate)} | ${fmtConf(f.averageConfidence)} | ${fmtConf(f.averageConfidenceCorrect)} | ${fmtConf(f.averageConfidenceErrors)} |`,
  );
}
lines.push("");

// --- Confidence-threshold analysis (only for fields with errors) ---
lines.push(`## Confidence-threshold trade-offs`);
lines.push("");
if (fieldsWithErrors.length === 0) {
  lines.push(`No fields have errors — no threshold analysis needed.`);
  lines.push("");
} else {
  lines.push(
    `For each field with errors, the smallest review-gate threshold that ` +
      `catches the target fraction of errors, plus how many correct ` +
      `predictions would be flagged for review at that threshold (false ` +
      `positives). Gate semantics: \`flagged := confidence < threshold\`.`,
  );
  lines.push("");
  lines.push(
    `| Field | Errors | 100% capture: threshold | 100% FP | 80% capture: threshold | 80% FP | Notes |`,
  );
  lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | --- |`);
  const overlapWarnings = [];
  for (const f of fieldsWithErrors) {
    const instances = instancesByField.get(f.name) || [];
    const r100 = thresholdForRecall(instances, 1.0);
    const r80 = thresholdForRecall(instances, 0.8);
    const notes = [];
    if (r100?.unrankable) {
      notes.push("⚠ overlap");
      overlapWarnings.push(f.name);
    }
    const cell = (r) =>
      r == null
        ? "—"
        : `${r.threshold.toFixed(2)} (${r.errorsCaught}/${r.errorsTotal})`;
    const fp = (r) =>
      r == null ? "—" : `${r.falsePositives}/${r.correctTotal}`;
    lines.push(
      `| \`${f.name}\` | ${f.errorCount} | ${cell(r100)} | ${fp(r100)} | ${cell(r80)} | ${fp(r80)} | ${notes.join(" ") || "—"} |`,
    );
  }
  lines.push("");
  if (overlapWarnings.length > 0) {
    lines.push(
      `> ⚠ **Confidence overlap**: for fields marked \`overlap\`, at least one ` +
        `correct prediction sits at or below the highest error confidence. ` +
        `Pure confidence gating cannot perfectly separate errors from ` +
        `correct predictions for these — review the underlying samples.`,
    );
    lines.push("");
  }
}

// --- Error type breakdown ---
lines.push(`## Error types: missing, extra, wrong`);
lines.push("");
if (totalClassifiedErrors === 0) {
  lines.push(`No errors to classify.`);
  lines.push("");
} else {
  lines.push(
    `Each error is classified by emptiness on each side. The three failure ` +
      `modes usually have different root causes, so the split is a much ` +
      `better fix-prioritization signal than the raw error count.`,
  );
  lines.push("");
  lines.push(
    `- **Missing** — \`expected\` has a value but \`predicted\` is null or empty. ` +
      `The field exists in the document but the model didn't return it. ` +
      `Root cause is usually **extraction failure** (model missed the region, ` +
      `OCR dropped the text, or the prompt didn't ask for the field).`,
  );
  lines.push(
    `- **Extra** — \`expected\` is null or empty but \`predicted\` has a value. ` +
      `The model returned something for a field that should have been blank. ` +
      `Root cause is usually **hallucination / over-extraction** (model ` +
      `pulled in adjacent text, invented a value, or didn't recognize that ` +
      `the field was intentionally left empty).`,
  );
  lines.push(
    `- **Wrong** — both \`expected\` and \`predicted\` have values but they ` +
      `don't match. Root cause is usually a **parsing, normalization, or ` +
      `interpretation bug** (date format, whitespace, units, picked the ` +
      `wrong region of the document).`,
  );
  lines.push("");
  lines.push(
    `Overall: **${totalMissing} missing** (${fmtPct(totalMissing / totalClassifiedErrors)}), ` +
      `**${totalExtra} extra** (${fmtPct(totalExtra / totalClassifiedErrors)}), ` +
      `**${totalWrong} wrong** (${fmtPct(totalWrong / totalClassifiedErrors)}) ` +
      `of ${totalClassifiedErrors} total errors.`,
  );
  lines.push("");

  const fieldsWithErr = [...breakdownByField.keys()].sort((a, b) => {
    const sa = breakdownByField.get(a);
    const sb = breakdownByField.get(b);
    return (
      sb.missing + sb.extra + sb.wrong - (sa.missing + sa.extra + sa.wrong)
    );
  });
  if (fieldsWithErr.length > 0) {
    lines.push(`| Field | Errors | Missing | Extra | Wrong |`);
    lines.push(`| --- | ---: | ---: | ---: | ---: |`);
    for (const name of fieldsWithErr) {
      const b = breakdownByField.get(name);
      lines.push(
        `| \`${name}\` | ${b.missing + b.extra + b.wrong} | ${b.missing} | ${b.extra} | ${b.wrong} |`,
      );
    }
    lines.push("");
  }
}

// --- Cross-field error correlation ---
lines.push(`## Cross-field error correlation`);
lines.push("");
if (errorsBySample.size === 0) {
  lines.push(`No errors to correlate across samples.`);
  lines.push("");
} else {
  const sampleStats = [...errorsBySample.entries()]
    .map(([id, errs]) => ({
      id,
      count: errs.length,
      fields: errs.map((e) => e.field),
    }))
    .sort((a, b) => b.count - a.count);

  const totalSamplesWithErrors = sampleStats.length;
  const totalSamplesAll = (data.perSampleResults || []).length;
  const maxSampleErrors = sampleStats[0].count;
  const meanSampleErrors =
    sampleStats.reduce((s, x) => s + x.count, 0) / sampleStats.length;

  lines.push(`### Errors per sample`);
  lines.push("");
  lines.push(
    `${totalSamplesWithErrors} of ${totalSamplesAll} samples have at least ` +
      `one error. Top sample has **${maxSampleErrors}** errors; mean across ` +
      `samples-with-errors is **${meanSampleErrors.toFixed(1)}**.`,
  );
  lines.push("");
  if (
    sampleStats.length > 1 &&
    maxSampleErrors >= 3 * Math.max(meanSampleErrors, 1)
  ) {
    lines.push(
      `> Errors are concentrated in a few documents (top sample ≥ 3× the ` +
        `mean). The underlying cause is more likely document-level (scan ` +
        `quality, layout, language) than field-level.`,
    );
    lines.push("");
  } else if (sampleStats.length > 1) {
    lines.push(
      `> Errors are spread fairly evenly across samples. The underlying ` +
        `cause is more likely field-level (specific extraction or parsing ` +
        `bugs) than document-level.`,
    );
    lines.push("");
  }

  const showLimit = 15;
  const fieldLimit = 6;
  lines.push(`| Sample | Errors | Failed fields |`);
  lines.push(`| --- | ---: | --- |`);
  for (const s of sampleStats.slice(0, showLimit)) {
    const visible = s.fields
      .slice(0, fieldLimit)
      .map((f) => `\`${f}\``)
      .join(", ");
    const remainder =
      s.fields.length > fieldLimit
        ? ` _+${s.fields.length - fieldLimit} more_`
        : "";
    lines.push(`| \`${s.id}\` | ${s.count} | ${visible}${remainder} |`);
  }
  if (sampleStats.length > showLimit) {
    lines.push(
      `| _… ${sampleStats.length - showLimit} more samples_ | | |`,
    );
  }
  lines.push("");

  const pairs = [...cooccurrenceCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  lines.push(`### Co-failing field pairs`);
  lines.push("");
  if (pairs.length === 0) {
    lines.push(
      `No pairs of fields failed together in two or more samples — errors ` +
        `don't cluster in repeating field combinations.`,
    );
    lines.push("");
  } else {
    lines.push(
      `Pairs of fields that failed in the same sample at least twice. ` +
        `Strong pairs often share a structural cause (same region of the ` +
        `document, same parsing rule, etc.).`,
    );
    lines.push("");
    lines.push(`| Field A | Field B | Co-failures |`);
    lines.push(`| --- | --- | ---: |`);
    for (const [key, count] of pairs) {
      const [a, b] = key.split("||");
      lines.push(`| \`${a}\` | \`${b}\` | ${count} |`);
    }
    lines.push("");
  }
}

// --- Things worth knowing ---
lines.push(`## Other observations`);
lines.push("");

// Confidence collapse (averageConfidence at the floor / ceiling)
const allCorrectConfs = [];
const allErrorConfs = [];
for (const f of perField) {
  if (typeof f.averageConfidenceCorrect === "number")
    allCorrectConfs.push(f.averageConfidenceCorrect);
  if (typeof f.averageConfidenceErrors === "number")
    allErrorConfs.push(f.averageConfidenceErrors);
}
const meanCorrect =
  allCorrectConfs.length === 0
    ? null
    : allCorrectConfs.reduce((a, b) => a + b, 0) / allCorrectConfs.length;
const meanError =
  allErrorConfs.length === 0
    ? null
    : allErrorConfs.reduce((a, b) => a + b, 0) / allErrorConfs.length;

lines.push(`### Confidence calibration`);
lines.push(``);
lines.push(`Average confidence on **correct** predictions across all fields: ${fmtConf(meanCorrect)}`);
lines.push(``);
lines.push(`Average confidence on **error** predictions across all fields: ${fmtConf(meanError)}`);
lines.push(``);
if (typeof meanCorrect === "number" && typeof meanError === "number") {
  const gap = meanCorrect - meanError;
  lines.push(
    `Gap (correct − error): **${gap.toFixed(3)}**. ` +
      (gap > 0.2
        ? `Wide gap → confidence is a useful error signal here.`
        : gap > 0.05
          ? `Modest gap → confidence helps but is far from definitive.`
          : `Narrow / negative gap → confidence is **not** a reliable error signal; threshold gating will produce many false positives or miss errors.`),
  );
  lines.push(``);
}

// Worst offenders summary
const top5 = sortedByErrorRate.filter((f) => f.errorCount > 0).slice(0, 5);
if (top5.length > 0) {
  lines.push(`### Top error contributors`);
  lines.push(``);
  for (const f of top5) {
    lines.push(
      `- \`${f.name}\` — ${f.errorCount}/${f.evaluatedCount} errors (${fmtPct(f.errorRate)}), avg error conf ${fmtConf(f.averageConfidenceErrors)}`,
    );
  }
  lines.push(``);
}

fs.writeFileSync(outputPath, lines.join("\n"));
console.log(`Wrote ${outputPath}`);
