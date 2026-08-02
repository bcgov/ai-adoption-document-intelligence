/**
 * Iterate-on-extraction tool for Azure Content Understanding.
 *
 * Reads the editable global prompt and per-field descriptions from
 * `experiments/results/03-content-understanding/iteration/`, deploys (or
 * upserts) the analyzer, calls CU for one sample, compares the prediction
 * to the ground-truth JSON on disk, and writes:
 *
 *   - last-request.json     analyzer body + analyze submission body
 *   - last-response.json    raw CU operation result (the GET poll result)
 *   - last-diff.md          per-field diff + headline metrics
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register scripts/iterate-cu-extraction.ts "synth-full (1)"
 *
 * Iteration loop:
 *   1. Edit prompt.md / field-descriptions.json
 *   2. Re-run this script
 *   3. Inspect last-diff.md
 */

import "../src/env-loader";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AxiosResponse } from "axios";
import { getPrismaClient } from "../src/activities/database-client";
import {
  buildCuAnalyzerDefinition,
  hashCuAnalyzerDefinition,
} from "../src/ocr-providers/azure-content-understanding/analyzer-schema-builder";
import {
  type CuAuthMode,
  createCuAxiosInstance,
  cuAnalyzeResultUrlFromId,
  cuAnalyzeResultUrlFromOperation,
  cuAnalyzeUrl,
  describeAxiosFailure,
} from "../src/ocr-providers/azure-content-understanding/azure-cu-client";
import { azureCuDeployAnalyzer } from "../src/ocr-providers/azure-content-understanding/azure-cu-deploy-analyzer";
import type { CuAnalyzeOperation } from "../src/ocr-providers/azure-content-understanding/cu-types";

const TEMPLATE_MODEL_ID = "seed-sdpr-monthly-report-template";
const DEFAULT_SAMPLE_ID = "synth-full (1)";
const DEFAULT_AUTH_MODE: CuAuthMode = "subscription-key";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
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
  "03-content-understanding",
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
  const out: FieldDescriptions = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function findSampleFile(sampleId: string, ext: "jpg" | "json"): string {
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
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return true;
  if (aEmpty || bEmpty) return false;
  const aNum =
    typeof a === "number" ? a : Number(String(a).replace(/[$,\s]/g, ""));
  const bNum =
    typeof b === "number" ? b : Number(String(b).replace(/[$,\s]/g, ""));
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return Math.abs(aNum - bNum) < 0.005;
  }
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
  lines.push(
    `CU call (deploy + submit + poll): ${opts.elapsedMs} ms.  ${opts.rawResponseSummary}`,
  );
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

/**
 * CU rejects analyzer IDs that contain `-` (HTTP 400 "InvalidAnalyzerId").
 * Collapse to alphanumeric and lowercase-prefix.
 */
function sanitizeAnalyzerId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pickFieldValue(field: unknown): unknown {
  if (field == null || typeof field !== "object") return field;
  const f = field as Record<string, unknown>;
  if (f.valueString !== undefined) return f.valueString;
  if (f.valueNumber !== undefined) return f.valueNumber;
  if (f.valueDate !== undefined) return f.valueDate;
  if (f.value !== undefined) return f.value;
  return undefined;
}

async function main(): Promise<void> {
  const sampleId = process.argv[2] ?? DEFAULT_SAMPLE_ID;
  const endpoint = process.env.AZURE_CU_ENDPOINT?.replace(/\/+$/, "");
  const apiKey = process.env.AZURE_CU_KEY;
  const analyzerPrefix =
    process.env.AZURE_CU_ANALYZER_PREFIX ?? "di-experiment";
  const authMode: CuAuthMode =
    (process.env.AZURE_CU_AUTH_MODE as CuAuthMode | undefined) ??
    DEFAULT_AUTH_MODE;
  if (!endpoint || !apiKey) {
    throw new Error(
      "AZURE_CU_ENDPOINT and AZURE_CU_KEY must be set in the environment.",
    );
  }

  const jpgPath = findSampleFile(sampleId, "jpg");
  const jsonPath = findSampleFile(sampleId, "json");
  const buffer = await fs.promises.readFile(jpgPath);
  const inlineBase64 = buffer.toString("base64");
  const inlineMimeType = "image/jpeg";

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

  const analyzer = buildCuAnalyzerDefinition(fieldDefs, {
    descriptions,
    documentAnnotationPrompt: promptText,
    numericFieldsNullable: true,
  });
  if (!analyzer) {
    throw new Error("Failed to build CU analyzer (no fields).");
  }
  const bodyHash = hashCuAnalyzerDefinition(analyzer);
  // CU rejects analyzer IDs that contain `-`. Strip non-alphanumeric chars
  // (incl. underscores/dashes) and concatenate prefix+template.
  const analyzerId = sanitizeAnalyzerId(
    `${analyzerPrefix}-${TEMPLATE_MODEL_ID}`,
  );

  console.log(`→ analyzer: ${analyzerId}  (body hash: ${bodyHash})`);
  console.log(`  sample: ${sampleId}`);
  console.log(
    `  prompt: ${promptText ? `${promptText.length} chars` : "(none)"}`,
  );
  console.log(
    `  descriptions: ${Object.keys(descriptions).length} fields covered`,
  );

  const requestForDisk = {
    analyzerId,
    bodyHash,
    analyzer,
    submission: {
      url: cuAnalyzeUrl(analyzerId),
      body: {
        inputs: [
          {
            data: `[base64, ${inlineBase64.length} chars]`,
            mimeType: inlineMimeType,
          },
        ],
      },
    },
  };
  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-request.json"),
    JSON.stringify(requestForDisk, null, 2),
  );

  const client = createCuAxiosInstance({ endpoint, apiKey, authMode });
  const t0 = Date.now();

  // 1. Upsert the analyzer (idempotent — deletes + recreates if body changed,
  //    skips work if remote already matches).
  const deployResult = await azureCuDeployAnalyzer({
    analyzerId,
    analyzer,
    endpoint,
    apiKey,
    authMode,
  });
  console.log(`  deploy: ${deployResult.status}`);

  // 2. POST analyze.
  console.log(`→ POST ${cuAnalyzeUrl(analyzerId)}`);
  const submitResp = await client.post(cuAnalyzeUrl(analyzerId), {
    inputs: [{ data: inlineBase64, mimeType: inlineMimeType }],
  });
  if (submitResp.status !== 202 && submitResp.status !== 200) {
    console.error(
      `✗ analyze submit failed: ${submitResp.status}`,
      typeof submitResp.data === "object"
        ? JSON.stringify(submitResp.data)
        : submitResp.data,
    );
    process.exit(1);
  }
  const opLocation =
    (submitResp.headers["operation-location"] as string | undefined) ??
    (submitResp.headers["Operation-Location"] as string | undefined);
  const pollUrl = opLocation
    ? cuAnalyzeResultUrlFromOperation(opLocation)
    : cuAnalyzeResultUrlFromId(submitResp.data?.id ?? "");

  let resultBody: CuAnalyzeOperation | null = null;
  if (submitResp.status === 200 && submitResp.data?.status === "Succeeded") {
    resultBody = submitResp.data as CuAnalyzeOperation;
  }

  // 3. Poll until terminal.
  let attempt = 0;
  while (!resultBody) {
    attempt += 1;
    if (attempt > 240) {
      console.error("✗ analyze polling exhausted (240 attempts)");
      process.exit(1);
    }
    await sleep(1500);
    let resp: AxiosResponse;
    try {
      resp = await client.get(pollUrl);
    } catch (err) {
      const { status, message } = describeAxiosFailure(err);
      console.warn(
        `  poll error (attempt ${attempt}): ${status ?? "?"} ${message}`,
      );
      continue;
    }
    if (resp.status === 200) {
      const body = resp.data as CuAnalyzeOperation;
      if (body.status === "Succeeded") {
        resultBody = body;
        break;
      }
      if (body.status === "Failed") {
        console.error(
          "✗ analyze terminal failure:",
          body.error?.code,
          body.error?.message,
        );
        process.exit(1);
      }
      // running — continue
    } else if (resp.status >= 500 || resp.status === 429) {
      console.warn(`  poll transient ${resp.status} (attempt ${attempt})`);
    } else {
      console.error(
        `✗ poll non-2xx: ${resp.status}`,
        typeof resp.data === "object" ? JSON.stringify(resp.data) : resp.data,
      );
      process.exit(1);
    }
  }

  const elapsedMs = Date.now() - t0;

  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-response.json"),
    JSON.stringify(resultBody, null, 2),
  );

  const result = resultBody.result;
  const fields = (result?.contents?.[0]?.fields ?? {}) as Record<
    string,
    unknown
  >;
  const populated = Object.entries(fields).filter(
    ([, v]) =>
      pickFieldValue(v) !== undefined &&
      pickFieldValue(v) !== "" &&
      pickFieldValue(v) !== null,
  );
  const rawResponseSummary = `contents[0].fields populated=${populated.length}/${Object.keys(fields).length} • markdown.length=${(result?.contents?.[0]?.markdown ?? "").length}`;

  console.log(`← ${elapsedMs} ms — ${rawResponseSummary}`);

  if (Object.keys(fields).length === 0) {
    console.error(
      "✗ contents[0].fields is empty — analyzer schema may not be running. Check baseAnalyzerId / strict-mode flag / analyzer JSON.",
    );
  }

  const predicted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    predicted[k] = pickFieldValue(v);
  }
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
    `  written: experiments/results/03-content-understanding/iteration/{last-request,last-response,last-diff}.{json,md}`,
  );

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
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void getPrismaClient().$disconnect?.();
  });
