/**
 * E05 preflight check (VLM + OCR hybrid).
 *
 * Asserts every precondition needed to run an iteration / benchmark
 * before the first paid call:
 *
 *   1. Env vars present:
 *        AZURE_OPENAI_ENDPOINT / API_KEY / API_VERSION (defaulted) /
 *        DEPLOYMENT (or override on CLI),
 *        AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / API_KEY,
 *        TEST_API_KEY.
 *   2. AZURE_OPENAI_API_VERSION is recent enough for strict-mode
 *      structured outputs (≥ 2024-12-01-preview).
 *   3. Azure DI prebuilt-layout is reachable + producing markdown for a
 *      tiny test image (1×1 PNG submitted, polled, succeeded).
 *   4. The chosen Azure OpenAI deployment is reachable + image-capable
 *      + strict-mode round-trips on a 1×1 PNG.
 *   5. The dataset version `seed-local-samples-mix-private-v1` is
 *      present in the DB.
 *   6. The seeded SDPR template (`seed-sdpr-monthly-report-template`)
 *      has a populated `field_schema`.
 *
 * All printed output redacts secrets (endpoint hostname only, never the
 * key). Exits non-zero on any failure.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register src/scripts/preflight-hybrid.ts [deployment-name]
 *
 *   default deployment: $AZURE_OPENAI_DEPLOYMENT or "gpt-5.4"
 */

import "../env-loader";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import axios from "axios";
import { config as dotenvConfig } from "dotenv";
import { getPrismaClient } from "../activities/database-client";

const overrideDir =
  process.env.DI_SECRETS_DIR ?? resolve(homedir(), ".config/bcgov-di");
const candidates = [
  resolve(overrideDir, "backend-services.env"),
  resolve(__dirname, "..", "..", "..", "backend-services", ".env"),
];
for (const p of candidates) {
  if (existsSync(p)) {
    dotenvConfig({ path: p, quiet: true });
  }
}

const TEMPLATE_MODEL_ID = "seed-sdpr-monthly-report-template";
const DATASET_VERSION_ID = "seed-local-samples-mix-private-v1";
const MIN_API_VERSION = "2024-12-01-preview";
// 1×1 white PNG — small enough for the VLM probe (it doesn't care
// about image dimensions for a "describe the image" prompt).
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// 60×60 white PNG — Azure DI requires images ≥ 50×50; any smaller and
// it returns InvalidContentDimensions. Used for the DI probe only.
const PROBE_DI_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAIAAAC1nk4lAAAAVklEQVR4nO3OQQ0AIAwAsfk3DR72KCG5KuicD83rwEZppbRSWimtlFZKK6WV0kpppbRSWimtlFZKK6WV0kpppbRSWimtlFZKK6WV0kpppbRSWimtlFYusXEIR3MwvfwAAAAASUVORK5CYII=";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const marker = ok ? "✅" : "❌";
  console.log(`${marker} ${name} — ${detail}`);
}

function maskEndpoint(endpoint: string | undefined): string {
  if (!endpoint) return "(unset)";
  try {
    const url = new URL(endpoint);
    return url.host;
  } catch {
    return "(unparseable)";
  }
}

function compareApiVersion(
  actual: string,
  minimum: string,
): "ok" | "older" | "unparseable" {
  const re = /^(\d{4})-(\d{2})-(\d{2})/;
  const a = actual.match(re);
  const b = minimum.match(re);
  if (!a || !b) return "unparseable";
  if (a[1] !== b[1]) return a[1] > b[1] ? "ok" : "older";
  if (a[2] !== b[2]) return a[2] > b[2] ? "ok" : "older";
  if (a[3] !== b[3]) return a[3] > b[3] ? "ok" : "older";
  return "ok";
}

async function checkEnvVars(): Promise<{
  aoaiEndpoint: string | undefined;
  aoaiApiKey: string | undefined;
  aoaiApiVersion: string;
  aoaiDeployment: string;
  diEndpoint: string | undefined;
  diApiKey: string | undefined;
}> {
  const aoaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const aoaiApiKey = process.env.AZURE_OPENAI_API_KEY;
  const aoaiApiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? MIN_API_VERSION;
  const cliDeployment = process.argv[2];
  const aoaiDeployment =
    cliDeployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.4";

  record(
    "AZURE_OPENAI_ENDPOINT set",
    !!aoaiEndpoint,
    aoaiEndpoint ? `→ ${maskEndpoint(aoaiEndpoint)}` : "missing",
  );
  record(
    "AZURE_OPENAI_API_KEY set",
    !!aoaiApiKey,
    aoaiApiKey ? "(redacted)" : "missing",
  );
  const cmp = compareApiVersion(aoaiApiVersion, MIN_API_VERSION);
  record(
    `AZURE_OPENAI_API_VERSION ≥ ${MIN_API_VERSION}`,
    cmp === "ok",
    cmp === "ok"
      ? `${aoaiApiVersion}`
      : cmp === "older"
        ? `${aoaiApiVersion} is older than ${MIN_API_VERSION}; strict-mode structured outputs need at least the December 2024 preview`
        : `unparseable: "${aoaiApiVersion}"`,
  );
  record("AZURE_OPENAI_DEPLOYMENT chosen", true, aoaiDeployment);

  const diEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const diApiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  record(
    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT set",
    !!diEndpoint,
    diEndpoint ? `→ ${maskEndpoint(diEndpoint)}` : "missing",
  );
  record(
    "AZURE_DOCUMENT_INTELLIGENCE_API_KEY set",
    !!diApiKey,
    diApiKey ? "(redacted)" : "missing",
  );

  const testApiKey = process.env.TEST_API_KEY;
  record(
    "TEST_API_KEY loadable (backend-services env)",
    !!testApiKey,
    testApiKey ? "(redacted)" : "missing — trigger script will fail",
  );

  return {
    aoaiEndpoint,
    aoaiApiKey,
    aoaiApiVersion,
    aoaiDeployment,
    diEndpoint,
    diApiKey,
  };
}

async function probeDi(opts: {
  endpoint: string;
  apiKey: string;
}): Promise<void> {
  // DI prebuilt-layout against a 1×1 PNG should succeed almost
  // immediately. We submit + poll once to confirm reachability + the
  // markdown output format works.
  const base = opts.endpoint.replace(/\/$/, "");
  const submitUrl = `${base}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&outputContentFormat=markdown`;
  let operationLocation: string | undefined;
  try {
    const submit = await axios.post(
      submitUrl,
      { base64Source: PROBE_DI_PNG_BASE64 },
      {
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": opts.apiKey,
          "api-key": opts.apiKey,
        },
        timeout: 60_000,
        validateStatus: () => true,
      },
    );
    if (submit.status !== 202 && submit.status !== 200) {
      const body =
        typeof submit.data === "object"
          ? JSON.stringify(submit.data)
          : submit.data;
      record(
        "Azure DI prebuilt-layout submit",
        false,
        `HTTP ${submit.status}: ${body}`,
      );
      return;
    }
    operationLocation =
      (submit.headers["operation-location"] as string | undefined) ??
      (submit.headers["Operation-Location"] as string | undefined);
    record("Azure DI prebuilt-layout submit", true, "HTTP 202");
  } catch (err) {
    record(
      "Azure DI prebuilt-layout submit",
      false,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }
  if (!operationLocation) {
    record(
      "Azure DI prebuilt-layout poll",
      false,
      "submit response missing operation-location header",
    );
    return;
  }
  // Poll until terminal (max 30 attempts × 1s ≈ 30 s).
  for (let attempt = 0; attempt < 30; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
    try {
      const resp = await axios.get(operationLocation, {
        headers: {
          "Ocp-Apim-Subscription-Key": opts.apiKey,
          "api-key": opts.apiKey,
        },
        timeout: 30_000,
        validateStatus: () => true,
      });
      if (resp.status !== 200) continue;
      const status = resp.data?.status;
      if (status === "succeeded") {
        const content: unknown = resp.data?.analyzeResult?.content;
        record(
          "Azure DI prebuilt-layout markdown round-trip",
          typeof content === "string",
          typeof content === "string"
            ? `markdown returned (${content.length} chars)`
            : "succeeded but no content field",
        );
        return;
      }
      if (status === "failed") {
        record(
          "Azure DI prebuilt-layout poll",
          false,
          `terminal failure: ${JSON.stringify(resp.data?.error ?? {})}`,
        );
        return;
      }
    } catch (err) {
      // Swallow transient and continue
      if (attempt === 29) {
        record(
          "Azure DI prebuilt-layout poll",
          false,
          err instanceof Error ? err.message : String(err),
        );
        return;
      }
    }
  }
  record(
    "Azure DI prebuilt-layout poll",
    false,
    "timed out after 30 attempts (1s interval)",
  );
}

async function probeDeployment(opts: {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  deployment: string;
}): Promise<void> {
  const url = `${opts.endpoint.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(opts.deployment)}/chat/completions?api-version=${opts.apiVersion}`;
  const payload = {
    messages: [
      {
        role: "system" as const,
        content:
          "You are a helpful assistant. Look at the image and describe what you see in one short sentence.",
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: "Briefly describe the image. If the image is empty or blank, say so.",
          },
          {
            type: "image_url" as const,
            image_url: { url: `data:image/png;base64,${TINY_PNG_BASE64}` },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "vlm_hybrid_preflight",
        strict: true,
        schema: {
          type: "object",
          properties: {
            description: { type: "string" },
          },
          required: ["description"],
          additionalProperties: false,
        },
      },
    },
    max_completion_tokens: 256,
  };
  try {
    const resp = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "api-key": opts.apiKey,
      },
      timeout: 90_000,
      validateStatus: () => true,
    });
    if (resp.status !== 200) {
      const body =
        typeof resp.data === "object" ? JSON.stringify(resp.data) : resp.data;
      record(
        `deployment "${opts.deployment}" reachable + vision + strict-mode`,
        false,
        `HTTP ${resp.status}: ${body}`,
      );
      return;
    }
    const content = resp.data?.choices?.[0]?.message?.content;
    let parsed: { description?: unknown } | null = null;
    try {
      parsed =
        typeof content === "string"
          ? JSON.parse(content)
          : (content as { description?: unknown });
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed.description !== "string") {
      record(
        `deployment "${opts.deployment}" returns strict JSON`,
        false,
        `did not parse: ${typeof content === "string" ? content.slice(0, 120) : "(non-string content)"}`,
      );
      return;
    }
    record(
      `deployment "${opts.deployment}" reachable + vision + strict-mode`,
      true,
      "1×1 PNG round-trip succeeded",
    );
    if (resp.data?.usage) {
      const u = resp.data.usage as {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      record(
        "VLM probe token usage",
        true,
        `prompt=${u.prompt_tokens ?? "?"} completion=${u.completion_tokens ?? "?"}`,
      );
    }
  } catch (err) {
    record(
      `deployment "${opts.deployment}" reachable`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function checkDb(): Promise<void> {
  let prisma: ReturnType<typeof getPrismaClient> | null = null;
  try {
    prisma = getPrismaClient();
    const dvs = await prisma.datasetVersion.findFirst({
      where: { id: DATASET_VERSION_ID },
      select: { id: true },
    });
    record(
      `dataset version "${DATASET_VERSION_ID}" present`,
      !!dvs,
      dvs
        ? "found"
        : "missing — run `npm run test:db:reset` from the repo root",
    );
    const tm = await prisma.templateModel.findUnique({
      where: { id: TEMPLATE_MODEL_ID },
      include: { field_schema: { select: { field_key: true } } },
    });
    const fields = tm?.field_schema?.length ?? 0;
    record(
      `template "${TEMPLATE_MODEL_ID}" populated`,
      fields > 0,
      `field_schema rows: ${fields}`,
    );
  } catch (err) {
    record(
      "DB reachable",
      false,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await prisma?.$disconnect?.();
  }
}

async function main(): Promise<void> {
  console.log("E05 preflight (VLM + OCR hybrid, gpt-5.4 default)\n");
  const env = await checkEnvVars();
  console.log("");
  if (env.diEndpoint && env.diApiKey) {
    await probeDi({ endpoint: env.diEndpoint, apiKey: env.diApiKey });
  } else {
    record("Azure DI probe", false, "skipped — DI endpoint or key missing");
  }
  console.log("");
  if (env.aoaiEndpoint && env.aoaiApiKey) {
    await probeDeployment({
      endpoint: env.aoaiEndpoint,
      apiKey: env.aoaiApiKey,
      apiVersion: env.aoaiApiVersion,
      deployment: env.aoaiDeployment,
    });
  } else {
    record(`VLM deployment probe`, false, "skipped — endpoint or key missing");
  }
  console.log("");
  await checkDb();
  console.log("");

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length} preflight check(s) failed. Resolve before running the iteration / benchmark.\n`,
    );
    process.exit(1);
  } else {
    console.log("\n✓ All preflight checks passed. Safe to iterate.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
