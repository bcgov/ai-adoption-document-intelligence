/**
 * Iterate-on-extraction tool for Mistral Document AI on Foundry.
 *
 * Reads the editable global prompt and per-field descriptions from
 * `experiments/results/02-mistral-doc-ai-azure/iteration/`, calls Foundry
 * for one sample, compares the prediction to the ground-truth JSON on disk,
 * and writes:
 *
 *   - last-request.json   exactly what was POSTed to Foundry
 *   - last-response.json  raw Foundry OCR response
 *   - last-diff.md        per-field diff + headline metrics
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register src/scripts/iterate-mistral-extraction.ts "synth-full (3)"
 *
 * Iteration loop:
 *   1. Edit prompt.md / field-descriptions.json
 *   2. Re-run this script
 *   3. Inspect last-diff.md
 */

import "../env-loader";
import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import { getPrismaClient } from "../activities/database-client";
import { fieldDefinitionsToMistralDocumentAnnotationFormat } from "../ocr-providers/mistral/field-definitions-to-mistral-annotation-format";

const FOUNDRY_PATH = "/providers/mistral/azure/ocr";
const TEMPLATE_MODEL_ID = "seed-sdpr-monthly-report-template";
const DEFAULT_SAMPLE_ID = "synth-full (3)";
const DEPLOYMENT_ID = "mistral-document-ai-2512";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SAMPLES_DIR = path.join(
  REPO_ROOT,
  "data",
  "datasets",
  "samples-mix",
  "private",
);
const ITERATION_DIR = path.join(
  REPO_ROOT,
  "experiments",
  "results",
  "02-mistral-doc-ai-azure",
  "iteration",
);

interface FieldDescriptions {
  [field_key: string]: string;
}

function loadPrompt(): string {
  const p = path.join(ITERATION_DIR, "prompt.md");
  return fs.readFileSync(p, "utf-8").trim();
}

function loadDescriptions(): FieldDescriptions {
  const p = path.join(ITERATION_DIR, "field-descriptions.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>;
  // Strip _comment / underscore-prefixed metadata keys
  const out: FieldDescriptions = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function findSampleFile(sampleId: string, ext: "jpg" | "json"): string {
  // Prefer exact match
  const candidate = path.join(SAMPLES_DIR, `${sampleId}.${ext}`);
  if (fs.existsSync(candidate)) return candidate;
  throw new Error(`${ext.toUpperCase()} not found for sample ${sampleId}`);
}

interface DiffRow {
  field: string;
  predicted: unknown;
  expected: unknown;
  matched: boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Both empty/null
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return true;
  if (aEmpty || bEmpty) return false;
  // Numeric comparison with rounding tolerance
  const aNum =
    typeof a === "number" ? a : Number(String(a).replace(/[$,\s]/g, ""));
  const bNum =
    typeof b === "number" ? b : Number(String(b).replace(/[$,\s]/g, ""));
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return Math.abs(aNum - bNum) < 0.005;
  }
  // Loose string comparison: trim, lowercase, strip punctuation
  const norm = (v: unknown): string =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s\-_.]/g, "");
  return norm(a) === norm(b);
}

function buildDiff(
  predicted: Record<string, unknown>,
  expected: Record<string, unknown>,
): { rows: DiffRow[]; matched: number; mismatched: number; totalGt: number } {
  const allKeys = new Set([
    ...Object.keys(predicted),
    ...Object.keys(expected),
  ]);
  const rows: DiffRow[] = [];
  let matched = 0;
  let mismatched = 0;
  let totalGt = 0;
  for (const k of [...allKeys].sort()) {
    const p = predicted[k];
    const e = expected[k];
    const eq = valuesEqual(p, e);
    if (eq) matched += 1;
    else mismatched += 1;
    if (e !== null && e !== undefined && e !== "") totalGt += 1;
    rows.push({ field: k, predicted: p, expected: e, matched: eq });
  }
  return { rows, matched, mismatched, totalGt };
}

function diffToMarkdown(opts: {
  sampleId: string;
  rows: DiffRow[];
  matched: number;
  mismatched: number;
  totalGt: number;
  promptHash: string;
  descriptionsHash: string;
  elapsedMs: number;
  rawResponseSummary: string;
}): string {
  const total = opts.rows.length;
  const accuracy = total > 0 ? (opts.matched / total) * 100 : 0;
  const lines: string[] = [];
  lines.push(`# Iteration diff — \`${opts.sampleId}\``);
  lines.push("");
  lines.push(
    `Total fields: **${total}**  •  Matched: **${opts.matched}**  •  Mismatched: **${opts.mismatched}**  •  Field-accuracy: **${accuracy.toFixed(1)}%**`,
  );
  lines.push(`Foundry call: ${opts.elapsedMs} ms.  ${opts.rawResponseSummary}`);
  lines.push(
    `Prompt hash: \`${opts.promptHash}\`  •  Descriptions hash: \`${opts.descriptionsHash}\``,
  );
  lines.push("");
  lines.push("## Mismatched fields");
  lines.push("");
  lines.push("| field | predicted | expected |");
  lines.push("|---|---|---|");
  for (const r of opts.rows) {
    if (r.matched) continue;
    const p = JSON.stringify(r.predicted) ?? "(absent)";
    const e = JSON.stringify(r.expected) ?? "(absent)";
    lines.push(`| \`${r.field}\` | ${p} | ${e} |`);
  }
  lines.push("");
  lines.push("<details><summary>Matched fields (collapsed)</summary>");
  lines.push("");
  lines.push("| field | value |");
  lines.push("|---|---|");
  for (const r of opts.rows) {
    if (!r.matched) continue;
    lines.push(
      `| \`${r.field}\` | ${JSON.stringify(r.predicted) ?? "(empty)"} |`,
    );
  }
  lines.push("");
  lines.push("</details>");
  return `${lines.join("\n")}\n`;
}

function shortHash(s: string): string {
  // Cheap deterministic hash for change tracking
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function main(): Promise<void> {
  const sampleId = process.argv[2] ?? DEFAULT_SAMPLE_ID;
  const endpoint = process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT?.replace(
    /\/+$/,
    "",
  );
  const apiKey = process.env.MISTRAL_DOC_AI_AZURE_KEY;
  if (!endpoint || !apiKey) {
    throw new Error(
      "MISTRAL_DOC_AI_AZURE_ENDPOINT and MISTRAL_DOC_AI_AZURE_KEY must be set in the environment.",
    );
  }

  const jpgPath = findSampleFile(sampleId, "jpg");
  const jsonPath = findSampleFile(sampleId, "json");
  const buffer = await fs.promises.readFile(jpgPath);
  const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const prompt = loadPrompt();
  const descriptions = loadDescriptions();
  const promptText = prompt.length > 0 ? prompt : undefined;

  const prisma = getPrismaClient();
  const tm = await prisma.templateModel.findUnique({
    where: { id: TEMPLATE_MODEL_ID },
    include: { field_schema: { orderBy: { display_order: "asc" } } },
  });
  if (!tm) {
    throw new Error(`Template ${TEMPLATE_MODEL_ID} not found in DB.`);
  }
  const fieldDefs = tm.field_schema.map(
    (f: {
      field_key: string;
      field_type: string;
      field_format: string | null;
    }) => ({
      field_key: f.field_key,
      field_type: f.field_type as
        | "string"
        | "number"
        | "date"
        | "selectionMark"
        | "signature",
      field_format: f.field_format,
    }),
  );
  // Numeric fields are made nullable so Mistral can distinguish "cell is
  // blank" (return null) from "cell explicitly shows 0" (return 0). The
  // converter does this directly via the `numericFieldsNullable` option.
  const annotationFormat = fieldDefinitionsToMistralDocumentAnnotationFormat(
    fieldDefs,
    { descriptions, numericFieldsNullable: true },
  );

  const requestBody: Record<string, unknown> = {
    model: DEPLOYMENT_ID,
    document: { type: "document_url", document_url: dataUrl },
  };
  if (annotationFormat) {
    requestBody.document_annotation_format = annotationFormat;
  }
  if (promptText) {
    requestBody.document_annotation_prompt = promptText;
  }

  // Persist the request body (with the data URL truncated for readability).
  const requestForDisk = JSON.parse(JSON.stringify(requestBody));
  if (
    requestForDisk.document &&
    typeof requestForDisk.document.document_url === "string"
  ) {
    const u = requestForDisk.document.document_url as string;
    requestForDisk.document.document_url = `${u.slice(0, 64)}…[truncated, ${u.length} chars total]`;
  }
  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-request.json"),
    JSON.stringify(requestForDisk, null, 2),
  );

  const url = `${endpoint}${FOUNDRY_PATH}`;
  console.log(`→ POST ${url}`);
  console.log(`  sample: ${sampleId}`);
  console.log(
    `  prompt: ${promptText ? `${promptText.length} chars` : "(none)"}`,
  );
  console.log(
    `  descriptions: ${Object.keys(descriptions).length} fields covered`,
  );

  const t0 = Date.now();
  const { data } = await axios.post(url, requestBody, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 600_000,
    validateStatus: (s) => s === 200,
  });
  const elapsedMs = Date.now() - t0;

  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-response.json"),
    JSON.stringify(data, null, 2),
  );

  const annotationStr = data.document_annotation as string | null | undefined;
  const usage = data.usage_info as {
    pages_processed_annotation?: number;
    pages_processed?: number;
  };
  const rawResponseSummary = `pages_processed_annotation=${usage?.pages_processed_annotation ?? 0}, document_annotation length=${annotationStr ? annotationStr.length : 0}`;

  console.log(`← 200 in ${elapsedMs} ms — ${rawResponseSummary}`);

  if (!annotationStr) {
    console.error(
      "✗ document_annotation is null — annotation step did not run. Check schema/strict flag.",
    );
    process.exit(1);
  }

  const predicted = JSON.parse(annotationStr) as Record<string, unknown>;
  const expected = JSON.parse(
    await fs.promises.readFile(jsonPath, "utf-8"),
  ) as Record<string, unknown>;

  const { rows, matched, mismatched, totalGt } = buildDiff(predicted, expected);

  const md = diffToMarkdown({
    sampleId,
    rows,
    matched,
    mismatched,
    totalGt,
    promptHash: shortHash(prompt),
    descriptionsHash: shortHash(JSON.stringify(descriptions)),
    elapsedMs,
    rawResponseSummary,
  });
  await fs.promises.writeFile(path.join(ITERATION_DIR, "last-diff.md"), md);

  const accuracy = ((matched / rows.length) * 100).toFixed(1);
  console.log(
    `\n  ✓ matched ${matched}/${rows.length} (${accuracy}%)  •  mismatched ${mismatched}  •  GT non-empty ${totalGt}`,
  );
  console.log(
    `  written: experiments/results/02-mistral-doc-ai-azure/iteration/{last-request,last-response,last-diff}.{json,md}`,
  );

  // Print the top 15 mismatches inline so the loop is fast.
  const misses = rows.filter((r) => !r.matched).slice(0, 15);
  if (misses.length > 0) {
    console.log(`\n  Top mismatches (first 15):`);
    for (const r of misses) {
      console.log(
        `    ${r.field.padEnd(50)}  predicted=${JSON.stringify(r.predicted) ?? "(none)"}  expected=${JSON.stringify(r.expected) ?? "(none)"}`,
      );
    }
  }
}

main()
  .catch((err) => {
    if (axios.isAxiosError(err)) {
      console.error("HTTP error:", err.response?.status, err.message);
      console.error("body:", JSON.stringify(err.response?.data, null, 2));
    } else {
      console.error(err);
    }
    process.exit(1);
  })
  .finally(() => {
    void getPrismaClient().$disconnect?.();
  });
