/**
 * Poll an experiment benchmark run until terminal, then save the
 * export to experiments/results/<slug>/benchmark-run.json.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register src/scripts/poll-experiment-run.ts <runId> <slug>
 */

import "../env-loader";
import * as fs from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import axios, { type AxiosResponse } from "axios";
import { config as dotenvConfig } from "dotenv";

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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const runId = process.argv[2];
  const slug = process.argv[3];
  if (!runId || !slug) {
    throw new Error(
      "Usage: poll-experiment-run.ts <runId> <slug> (e.g. 03-content-understanding)",
    );
  }
  const apiKey = process.env.TEST_API_KEY;
  if (!apiKey) throw new Error("TEST_API_KEY not set in env.");
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3002";
  const baseRunUrl = `${backendUrl}/api/benchmark/projects/seed-experiments-project/runs/${runId}`;
  const headers = { "x-api-key": apiKey };

  let attempts = 0;
  let lastStatus = "";
  while (attempts < 600) {
    attempts += 1;
    let resp: AxiosResponse;
    try {
      resp = await axios.get(baseRunUrl, {
        headers,
        validateStatus: () => true,
      });
    } catch (err) {
      console.warn(`poll error attempt ${attempts}:`, (err as Error).message);
      await sleep(5000);
      continue;
    }
    if (resp.status !== 200) {
      console.error(`✗ poll non-200: ${resp.status}`);
      console.error(JSON.stringify(resp.data, null, 2));
      process.exit(1);
    }
    const status = resp.data?.status;
    if (status !== lastStatus) {
      console.log(
        `[attempt ${attempts}] status=${status}` +
          (resp.data?.metrics
            ? ` metrics keys=${Object.keys(resp.data.metrics).length}`
            : ""),
      );
      lastStatus = status;
    }
    if (status === "completed" || status === "failed") {
      console.log(`final status: ${status}`);
      const downloadResp = await axios.get(`${baseRunUrl}/download`, {
        headers,
        validateStatus: () => true,
      });
      if (downloadResp.status !== 200) {
        console.error(`✗ download failed: ${downloadResp.status}`);
        process.exit(1);
      }
      const outDir = path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "experiments",
        "results",
        slug,
      );
      const outFile = path.join(outDir, "benchmark-run.json");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(downloadResp.data, null, 2));
      console.log(`✓ saved ${outFile}`);
      if (status === "failed") process.exit(1);
      return;
    }
    await sleep(5000);
  }
  console.error("✗ poll exhausted attempts");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
