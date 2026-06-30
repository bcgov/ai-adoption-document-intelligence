/**
 * Iterate-on-extraction tool for the VLM + OCR hybrid path (E05).
 *
 * Reads the editable global prompt and per-field descriptions from
 * `experiments/results/05-vlm-ocr-hybrid/iteration/`, runs Azure DI
 * `prebuilt-layout` to get markdown, then sends image + OCR markdown to
 * the chosen Azure OpenAI deployment with the strict-mode JSON Schema.
 * Compares the prediction against ground truth and writes:
 *
 *   - last-request.json     (system/user messages, schema, deployment, ocr md)
 *   - last-response.json    (raw VLM payload + parsed structured output)
 *   - last-layout.json      (raw DI prebuilt-layout response we fed in)
 *   - last-diff.md          (per-field matched/mismatched table)
 *
 * Pattern lifted from `iterate-vlm-extraction.ts`. Calls the engines
 * directly (not through Temporal) to avoid worker reload churn during
 * tuning. ~12–28 s per call at gpt-5.4 capacity 100 (DI ~1–3 s + VLM
 * ~10–25 s).
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register src/scripts/iterate-hybrid-extraction.ts "synth-full (1)" [deployment]
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
import type { TemplateFieldType } from "../ocr-providers/vlm-direct/vlm-prompt-builder";
import type { VlmExtractionResponse } from "../ocr-providers/vlm-direct/vlm-types";
import { ocrLayoutToMarkdown } from "../ocr-providers/vlm-ocr-hybrid/ocr-to-markdown";
import { buildVlmHybridExtractionRequest } from "../ocr-providers/vlm-ocr-hybrid/vlm-hybrid-prompt-builder";
import type { OCRResponse } from "../types";

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
  "public",
);
const DEFAULT_ITERATION_DIR = path.join(
  REPO_ROOT,
  "experiments",
  "results",
  "05-vlm-ocr-hybrid",
  "iteration",
);
const ITERATION_DIR = process.env.ITERATION_DIR
  ? path.resolve(process.env.ITERATION_DIR)
  : DEFAULT_ITERATION_DIR;

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
  ocrDurationMs: number;
  vlmDurationMs: number;
  rawSummary: string;
  deployment: string;
  ocrMarkdownChars: number;
}): string {
  const total = opts.rows.length;
  const accuracy = total > 0 ? (opts.matched / total) * 100 : 0;
  const lines: string[] = [];
  lines.push(`# Iteration diff — \`${opts.sampleId}\` (vlm-ocr-hybrid)`);
  lines.push("");
  lines.push(
    `Deployment: **${opts.deployment}**  •  Total fields: **${total}**  •  Matched: **${opts.matched}**  •  Mismatched: **${opts.mismatched}**  •  Field-accuracy: **${accuracy.toFixed(1)}%**`,
  );
  lines.push(
    `OCR (DI prebuilt-layout): ${opts.ocrDurationMs} ms (${opts.ocrMarkdownChars} markdown chars)  •  VLM call: ${opts.vlmDurationMs} ms.  ${opts.rawSummary}`,
  );
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function callDiPrebuiltLayout(opts: {
  endpoint: string;
  apiKey: string;
  base64: string;
}): Promise<{ layoutResponse: OCRResponse; durationMs: number }> {
  const base = opts.endpoint.replace(/\/$/, "");
  const submitUrl = `${base}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&outputContentFormat=markdown`;
  const t0 = Date.now();
  const submit = await axios.post(
    submitUrl,
    { base64Source: opts.base64 },
    {
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": opts.apiKey,
        "api-key": opts.apiKey,
      },
      timeout: 120_000,
      validateStatus: () => true,
    },
  );
  if (submit.status !== 202 && submit.status !== 200) {
    throw new Error(
      `DI prebuilt-layout submit failed: HTTP ${submit.status} ${
        typeof submit.data === "object"
          ? JSON.stringify(submit.data)
          : submit.data
      }`,
    );
  }
  const operationLocation =
    (submit.headers["operation-location"] as string | undefined) ??
    (submit.headers["Operation-Location"] as string | undefined);
  if (!operationLocation) {
    throw new Error("DI prebuilt-layout submit missing operation-location.");
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    if (attempt > 0) await sleep(1500);
    const poll = await axios.get(operationLocation, {
      headers: {
        "Ocp-Apim-Subscription-Key": opts.apiKey,
        "api-key": opts.apiKey,
      },
      timeout: 60_000,
      validateStatus: () => true,
    });
    if (poll.status !== 200) continue;
    const status = poll.data?.status;
    if (status === "succeeded") {
      const layoutResponse: OCRResponse = {
        status: "succeeded",
        analyzeResult: poll.data?.analyzeResult,
        createdDateTime: poll.data?.createdDateTime,
        lastUpdatedDateTime: poll.data?.lastUpdatedDateTime,
      };
      return { layoutResponse, durationMs: Date.now() - t0 };
    }
    if (status === "failed") {
      throw new Error(
        `DI prebuilt-layout failed: ${JSON.stringify(poll.data?.error ?? {})}`,
      );
    }
  }
  throw new Error("DI prebuilt-layout poll timed out.");
}

async function main(): Promise<void> {
  const sampleId = process.argv[2] ?? DEFAULT_SAMPLE_ID;
  const cliDeployment = process.argv[3];

  const aoaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, "");
  const aoaiApiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? DEFAULT_API_VERSION;
  const deployment =
    cliDeployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? DEFAULT_DEPLOYMENT;
  if (!aoaiEndpoint || !aoaiApiKey) {
    throw new Error(
      "AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in the environment.",
    );
  }
  const diEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const diApiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  if (!diEndpoint || !diApiKey) {
    throw new Error(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY must be set in the environment.",
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

  console.log(`→ DI prebuilt-layout for sample: ${sampleId}`);
  const { layoutResponse, durationMs: ocrDurationMs } =
    await callDiPrebuiltLayout({
      endpoint: diEndpoint,
      apiKey: diApiKey,
      base64: inlineBase64,
    });
  const ocrMarkdown = ocrLayoutToMarkdown(layoutResponse, {
    includeBboxAnnotations: false,
  });
  console.log(
    `  OCR done in ${ocrDurationMs} ms (${ocrMarkdown.length} chars markdown)`,
  );
  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-layout.json"),
    JSON.stringify(layoutResponse, null, 2),
  );

  const request = buildVlmHybridExtractionRequest({
    fields,
    descriptions,
    documentAnnotationPrompt: prompt,
    numericFieldsNullable: true,
    ocrMarkdown,
  });
  if (!request) {
    throw new Error("Failed to build VLM-hybrid request (empty schema).");
  }

  console.log(`→ deployment: ${deployment}  apiVersion: ${apiVersion}`);
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
    ocrMarkdownChars: ocrMarkdown.length,
  };
  await fs.promises.writeFile(
    path.join(ITERATION_DIR, "last-request.json"),
    JSON.stringify(requestForDisk, null, 2),
  );

  const url = `${aoaiEndpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;
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
      "api-key": aoaiApiKey,
    },
    timeout: 600_000,
    validateStatus: () => true,
  });
  const vlmDurationMs = Date.now() - t0;
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
    durationMs: ocrDurationMs + vlmDurationMs,
    ocrDurationMs,
    vlmDurationMs,
    deployment,
    apiVersion,
    usage: resp.data?.usage,
    parsed,
    raw: resp.data,
    ocrMarkdown,
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
  console.log(`← VLM ${vlmDurationMs} ms — ${rawSummary}`);

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
    ocrDurationMs,
    vlmDurationMs,
    rawSummary,
    deployment,
    ocrMarkdownChars: ocrMarkdown.length,
  });
  await fs.promises.writeFile(path.join(ITERATION_DIR, "last-diff.md"), md);

  const accuracy = ((matched / rows.length) * 100).toFixed(1);
  console.log(
    `\n  ✓ matched ${matched}/${rows.length} (${accuracy}%)  •  mismatched ${mismatched}  •  GT non-empty ${totalGt}`,
  );
  console.log(
    `  written: ${path.relative(REPO_ROOT, ITERATION_DIR)}/{last-request,last-response,last-layout,last-diff}.{json,md}`,
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
