/**
 * Iterate-on-extraction tool for the VLM-direct path (E04).
 *
 * Reads the editable global prompt and per-field descriptions from
 * `experiments/results/04-vlm-direct/iteration/`, builds the strict-mode
 * JSON Schema, calls the chosen Azure OpenAI deployment with the sample
 * image, compares the prediction against ground truth, and writes:
 *
 *   - last-request.json     (system/user messages, schema, deployment)
 *   - last-response.json    (raw VLM payload + parsed structured output)
 *   - last-diff.md          (per-field matched/mismatched table)
 *
 * Pattern lifted from `iterate-cu-extraction.ts`. Calls the engine
 * directly (not through Temporal) to avoid worker reload churn during
 * tuning. ~10–25 s per call on gpt-5.4 at capacity 100.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register src/scripts/iterate-vlm-extraction.ts "synth-full (1)" [deployment]
 */

import "../env-loader";
import * as fs from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import axios from "axios";
import { config as dotenvConfig } from "dotenv";
import { getPrismaClient } from "../activities/database-client";
import {
  buildVlmExtractionRequest,
  type TemplateFieldType,
} from "../ocr-providers/vlm-direct/vlm-prompt-builder";
import type { VlmExtractionResponse } from "../ocr-providers/vlm-direct/vlm-types";

const overrideDir =
  process.env.DI_SECRETS_DIR ?? resolve(homedir(), ".config/bcgov-di");
const envFiles = [
  resolve(overrideDir, "backend-services.env"),
  resolve(__dirname, "..", "..", "..", "backend-services", ".env"),
];
for (const p of envFiles) {
  if (existsSync(p)) {
    dotenvConfig({ path: p, quiet: true });
  }
}

const TEMPLATE_MODEL_ID = "seed-sdpr-monthly-report-template";
const DEFAULT_SAMPLE_ID = "synth-full (1)";
const DEFAULT_API_VERSION = "2024-12-01-preview";
const DEFAULT_DEPLOYMENT = "gpt-5.4";
const DEFAULT_MAX_COMPLETION_TOKENS = 8192;

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
  "04-vlm-direct",
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
  sourceQuote?: string;
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
  quotes: Record<string, string>,
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
    rows.push({
      field: k,
      predicted: p,
      expected: e,
      matched: eq,
      sourceQuote: quotes[k],
    });
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
  rawSummary: string;
  deployment: string;
}): string {
  const total = opts.rows.length;
  const accuracy = total > 0 ? (opts.matched / total) * 100 : 0;
  const lines: string[] = [];
  lines.push(`# Iteration diff — \`${opts.sampleId}\` (gpt-direct)`);
  lines.push("");
  lines.push(
    `Deployment: **${opts.deployment}**  •  Total fields: **${total}**  •  Matched: **${opts.matched}**  •  Mismatched: **${opts.mismatched}**  •  Field-accuracy: **${accuracy.toFixed(1)}%**`,
  );
  lines.push(`Call: ${opts.elapsedMs} ms.  ${opts.rawSummary}`);
  lines.push(
    `Prompt hash: \`${opts.promptHash}\`  •  Descriptions hash: \`${opts.descriptionsHash}\``,
  );
  lines.push("");
  lines.push("## Mismatched fields");
  lines.push("");
  lines.push("| field | predicted | expected | source_quote |");
  lines.push("|---|---|---|---|");
  for (const r of opts.rows) {
    if (r.matched) continue;
    const p = JSON.stringify(r.predicted) ?? "(absent)";
    const e = JSON.stringify(r.expected) ?? "(absent)";
    const q = r.sourceQuote ? r.sourceQuote.slice(0, 80) : "";
    lines.push(`| \`${r.field}\` | ${p} | ${e} | ${q} |`);
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
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function main(): Promise<void> {
  const sampleId = process.argv[2] ?? DEFAULT_SAMPLE_ID;
  const cliDeployment = process.argv[3];

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? DEFAULT_API_VERSION;
  const deployment =
    cliDeployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? DEFAULT_DEPLOYMENT;
  if (!endpoint || !apiKey) {
    throw new Error(
      "AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in the environment.",
    );
  }

  const jpgPath = findSampleFile(sampleId, "jpg");
  const jsonPath = findSampleFile(sampleId, "json");
  const buffer = await fs.promises.readFile(jpgPath);
  const inlineBase64 = buffer.toString("base64");
  const inlineMimeType = "image/jpeg";

  const prompt = loadPrompt();
  const descriptions = loadDescriptions();

  const prisma = getPrismaClient();
  const tm = await prisma.templateModel.findUnique({
    where: { id: TEMPLATE_MODEL_ID },
    include: { field_schema: { orderBy: { display_order: "asc" } } },
  });
  if (!tm) {
    throw new Error(`Template ${TEMPLATE_MODEL_ID} not found in DB.`);
  }
  const fields = tm.field_schema.map(
    (f: {
      field_key: string;
      field_type: string;
      field_format: string | null;
    }) => ({
      field_key: f.field_key,
      field_type: f.field_type as TemplateFieldType,
      field_format: f.field_format,
    }),
  );
  const request = buildVlmExtractionRequest({
    fields,
    descriptions,
    documentAnnotationPrompt: prompt,
    numericFieldsNullable: true,
  });
  if (!request) {
    throw new Error("Failed to build VLM request (empty schema).");
  }

  console.log(`→ deployment: ${deployment}  apiVersion: ${apiVersion}`);
  console.log(`  sample: ${sampleId}`);
  console.log(`  prompt: ${prompt.length} chars`);
  console.log(`  descriptions: ${Object.keys(descriptions).length} fields`);
  console.log(`  schema: ${request.fieldKeys.length} field keys`);

  const requestForDisk = {
    deployment,
    apiVersion,
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    responseFormat: request.responseFormat,
    image: {
      mimeType: inlineMimeType,
      sizeBytes: buffer.byteLength,
      base64Length: inlineBase64.length,
    },
  };
  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-request.json"),
    JSON.stringify(requestForDisk, null, 2),
  );

  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;
  const payload = {
    messages: [
      { role: "system" as const, content: request.systemPrompt },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: request.userPrompt },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:${inlineMimeType};base64,${inlineBase64}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: request.responseFormat.name,
        strict: true,
        schema: request.responseFormat.schema,
      },
    },
    max_completion_tokens: DEFAULT_MAX_COMPLETION_TOKENS,
  };

  const t0 = Date.now();
  const resp = await axios.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    timeout: 600_000,
    validateStatus: () => true,
  });
  const elapsedMs = Date.now() - t0;
  if (resp.status !== 200) {
    console.error(`✗ HTTP ${resp.status}`);
    console.error(
      typeof resp.data === "object"
        ? JSON.stringify(resp.data, null, 2)
        : resp.data,
    );
    process.exit(1);
  }

  const content = resp.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("✗ response missing choices[0].message.content");
    process.exit(1);
  }
  let parsed: VlmExtractionResponse;
  try {
    parsed = JSON.parse(content) as VlmExtractionResponse;
  } catch (err) {
    console.error(
      "✗ response content is not valid JSON — strict-mode flag may be off",
      err instanceof Error ? err.message : err,
    );
    console.error(content.slice(0, 500));
    process.exit(1);
  }

  const responseForDisk = {
    durationMs: elapsedMs,
    deployment,
    apiVersion,
    usage: resp.data?.usage,
    parsed,
    raw: resp.data,
  };
  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-response.json"),
    JSON.stringify(responseForDisk, null, 2),
  );

  const populated = Object.entries(parsed.fields ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const evidenced = Object.entries(parsed.source_quotes ?? {}).filter(
    ([, q]) => typeof q === "string" && q.trim().length > 0,
  );
  const rawSummary = `fields populated=${populated.length}/${
    Object.keys(parsed.fields ?? {}).length
  } • evidence quotes=${evidenced.length}`;
  console.log(`← ${elapsedMs} ms — ${rawSummary}`);

  const expected = JSON.parse(
    await fs.promises.readFile(jsonPath, "utf-8"),
  ) as Record<string, unknown>;

  const { rows, matched, mismatched, totalGt } = buildDiff(
    parsed.fields as Record<string, unknown>,
    expected,
    parsed.source_quotes ?? {},
  );

  const md = diffToMarkdown({
    sampleId,
    rows,
    matched,
    mismatched,
    totalGt,
    promptHash: shortHash(prompt),
    descriptionsHash: shortHash(JSON.stringify(descriptions)),
    elapsedMs,
    rawSummary,
    deployment,
  });
  await fs.promises.writeFile(path.join(ITERATION_DIR, "last-diff.md"), md);

  const accuracy = ((matched / rows.length) * 100).toFixed(1);
  console.log(
    `\n  ✓ matched ${matched}/${rows.length} (${accuracy}%)  •  mismatched ${mismatched}  •  GT non-empty ${totalGt}`,
  );
  console.log(
    `  written: experiments/results/04-vlm-direct/iteration/{last-request,last-response,last-diff}.{json,md}`,
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
