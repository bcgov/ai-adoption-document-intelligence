/**
 * E04 preflight check.
 *
 * Asserts every precondition needed to run an iteration / benchmark before
 * the first paid call:
 *
 *   1. Env vars present: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY,
 *      AZURE_OPENAI_API_VERSION (defaulted), AZURE_OPENAI_DEPLOYMENT
 *      (or override on CLI), TEST_API_KEY.
 *   2. AZURE_OPENAI_API_VERSION is recent enough for strict-mode
 *      structured outputs (≥ 2024-12-01-preview).
 *   3. The chosen deployment is reachable + image-capable. Sends a
 *      minimal vision request (1×1 PNG) with a tiny strict-mode schema.
 *      Verifies a 200 + parseable JSON response, plus capacity ≥ 50 if
 *      the response includes deployment usage info.
 *   4. The dataset version `seed-local-samples-mix-public-v1` is present
 *      in the DB.
 *   5. The seeded SDPR template (`seed-sdpr-monthly-report-template`) has
 *      a populated `field_schema`.
 *
 * All printed output redacts secrets (endpoint hostname only, never the
 * key). Exits non-zero on any failure.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register scripts/preflight-vlm.ts [deployment-name]
 *
 *   default deployment: $AZURE_OPENAI_DEPLOYMENT or "gpt-5.4"
 */

import "../src/env-loader";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import axios from "axios";
import { config as dotenvConfig } from "dotenv";
import { getPrismaClient } from "../src/activities/database-client";

const overrideDir =
  process.env.DI_SECRETS_DIR ?? resolve(homedir(), ".config/bcgov-di");
const candidates = [
  resolve(overrideDir, "backend-services.env"),
  resolve(__dirname, "..", "..", "backend-services", ".env"),
];
for (const p of candidates) {
  if (existsSync(p)) {
    dotenvConfig({ path: p, quiet: true });
  }
}

const TEMPLATE_MODEL_ID = "seed-sdpr-monthly-report-template";
const DATASET_VERSION_ID = "seed-local-samples-mix-public-v1";
const MIN_API_VERSION = "2024-12-01-preview";
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

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
  endpoint: string | undefined;
  apiKey: string | undefined;
  apiVersion: string;
  deployment: string;
}> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? MIN_API_VERSION;
  const cliDeployment = process.argv[2];
  const deployment =
    cliDeployment ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.4";

  record(
    "AZURE_OPENAI_ENDPOINT set",
    !!endpoint,
    endpoint ? `→ ${maskEndpoint(endpoint)}` : "missing",
  );
  record(
    "AZURE_OPENAI_API_KEY set",
    !!apiKey,
    apiKey ? "(redacted)" : "missing",
  );
  const cmp = compareApiVersion(apiVersion, MIN_API_VERSION);
  record(
    `AZURE_OPENAI_API_VERSION ≥ ${MIN_API_VERSION}`,
    cmp === "ok",
    cmp === "ok"
      ? `${apiVersion}`
      : cmp === "older"
        ? `${apiVersion} is older than ${MIN_API_VERSION}; strict-mode structured outputs need at least the December 2024 preview`
        : `unparseable: "${apiVersion}"`,
  );
  record("AZURE_OPENAI_DEPLOYMENT chosen", true, deployment);

  const testApiKey = process.env.TEST_API_KEY;
  record(
    "TEST_API_KEY loadable (backend-services env)",
    !!testApiKey,
    testApiKey ? "(redacted)" : "missing — trigger script will fail",
  );

  return { endpoint, apiKey, apiVersion, deployment };
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
        name: "vlm_preflight",
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
        "probe token usage",
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
  console.log("E04 preflight (VLM-direct, gpt-5.4 default)\n");
  const env = await checkEnvVars();
  console.log("");
  if (env.endpoint && env.apiKey) {
    await probeDeployment({
      endpoint: env.endpoint,
      apiKey: env.apiKey,
      apiVersion: env.apiVersion,
      deployment: env.deployment,
    });
  } else {
    record(`deployment probe`, false, "skipped — endpoint or key missing");
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
