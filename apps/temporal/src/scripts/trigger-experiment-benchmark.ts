/**
 * Trigger an experiment benchmark run without leaking the TEST_API_KEY
 * to the shell. Loads it via the shared env-loader (override file +
 * repo-local .env). Mirrors what `scripts/run-experiment-benchmarks.sh`
 * does, but suitable for environments where the harness can't read the
 * env file directly.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register src/scripts/trigger-experiment-benchmark.ts 03
 */

import "../env-loader";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import axios from "axios";
import { config as dotenvConfig } from "dotenv";

// Also pull TEST_API_KEY from the backend-services env file (the
// temporal env-loader only reads temporal.env, but TEST_API_KEY is owned
// by backend-services). Try the override file first, then the repo-local
// .env file. Falls back silently if both are absent.
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

async function main(): Promise<void> {
  const slugArg = process.argv[2];
  if (!slugArg) {
    throw new Error("Usage: trigger-experiment-benchmark.ts <slug-or-prefix>");
  }
  const allSlugs = [
    "01-neural-doc-intelligence",
    "02-mistral-doc-ai-azure",
    "03-content-understanding",
    "04-vlm-direct",
    "05-vlm-ocr-hybrid",
  ];
  const slug = allSlugs.find((s) => s.startsWith(slugArg)) ?? slugArg;

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3002";
  const apiKey = process.env.TEST_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TEST_API_KEY not set in env. The shared env-loader pulls it from ~/.config/bcgov-di/backend-services.env if present.",
    );
  }

  const url = `${backendUrl}/api/benchmark/projects/seed-experiments-project/definitions/seed-experiment-${slug}-definition/runs`;
  console.log(`▶ POST ${url}`);

  try {
    const sampleTimeoutSec = Number(process.env.SAMPLE_TIMEOUT_SECONDS ?? 3600);
    const concurrency = Number(process.env.SAMPLE_CONCURRENCY ?? 0);
    const resp = await axios.post(
      url,
      {
        tags: { experiment: slug },
        persistOcrCache: true,
        runtimeSettingsOverride: {
          timeout: sampleTimeoutSec,
          retries: 1,
          ...(concurrency > 0 ? { concurrency } : {}),
        },
      },
      {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      },
    );
    if (resp.status === 200 || resp.status === 201) {
      console.log(
        `✓ accepted (run id: ${resp.data?.id ?? "unknown"}, status: ${resp.data?.status ?? "?"})`,
      );
      console.log(JSON.stringify(resp.data, null, 2));
    } else {
      console.error(`✗ HTTP ${resp.status}`);
      console.error(
        typeof resp.data === "object"
          ? JSON.stringify(resp.data, null, 2)
          : resp.data,
      );
      process.exit(1);
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("HTTP error:", err.response?.status, err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
