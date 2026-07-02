/**
 * One-time E03 setup: PATCH /contentunderstanding/defaults so CU knows
 * which deployments to bind to its model aliases. Loads env via the
 * shared env-loader so it picks up AZURE_CU_ENDPOINT / AZURE_CU_KEY from
 * the override file without leaking secrets to the shell.
 *
 * Usage (from apps/temporal):
 *   npx tsx -r tsconfig-paths/register scripts/setup-cu-defaults.ts
 *
 * Idempotent — repeating the call simply overwrites defaults to the same
 * values.
 *
 * Optional env overrides:
 *   GPT_COMPLETION_DEPLOYMENT  (default: gpt-5.2)
 *   GPT_COMPLETION_MODEL_ALIAS (default: gpt-5.2)
 *   EMBEDDING_DEPLOYMENT       (default: text-embedding-3-large)
 *   GPT_MINI_DEPLOYMENT        (optional; if set, also wires
 *                               prebuilt-analyzer-completion-mini)
 */

import "../src/env-loader";
import {
  type CuAuthMode,
  createCuAxiosInstance,
} from "../src/ocr-providers/azure-content-understanding/azure-cu-client";

async function main(): Promise<void> {
  const endpoint = process.env.AZURE_CU_ENDPOINT?.replace(/\/+$/, "");
  const apiKey = process.env.AZURE_CU_KEY;
  const authMode: CuAuthMode =
    (process.env.AZURE_CU_AUTH_MODE as CuAuthMode | undefined) ??
    "subscription-key";

  if (!endpoint || !apiKey) {
    throw new Error(
      "AZURE_CU_ENDPOINT and AZURE_CU_KEY must be set in the environment.",
    );
  }

  const completionDeployment =
    process.env.GPT_COMPLETION_DEPLOYMENT ?? "gpt-5.2";
  const completionAlias = process.env.GPT_COMPLETION_MODEL_ALIAS ?? "gpt-5.2";
  const embeddingDeployment =
    process.env.EMBEDDING_DEPLOYMENT ?? "text-embedding-3-large";
  const miniDeployment = process.env.GPT_MINI_DEPLOYMENT;

  const modelDeployments: Record<string, string> = {
    [completionAlias]: completionDeployment,
    "text-embedding-3-large": embeddingDeployment,
    "prebuilt-analyzer-completion": completionDeployment,
    "prebuilt-analyzer-embedding": embeddingDeployment,
  };
  if (miniDeployment) {
    modelDeployments["gpt-4.1-mini"] = miniDeployment;
    modelDeployments["prebuilt-analyzer-completion-mini"] = miniDeployment;
  }

  const client = createCuAxiosInstance({ endpoint, apiKey, authMode });
  const url = "/contentunderstanding/defaults?api-version=2025-11-01";

  console.log(`→ PATCH ${endpoint}${url}`);
  for (const [alias, deployment] of Object.entries(modelDeployments)) {
    console.log(`  ${alias.padEnd(40)} = ${deployment}`);
  }

  const resp = await client.patch(url, { modelDeployments });
  if (resp.status >= 200 && resp.status < 300) {
    console.log(`✓ CU defaults updated (HTTP ${resp.status})`);
    if (typeof resp.data === "object") {
      console.log(JSON.stringify(resp.data, null, 2));
    }
  } else {
    console.error(`✗ CU defaults PATCH failed: HTTP ${resp.status}`);
    console.error(
      typeof resp.data === "object"
        ? JSON.stringify(resp.data, null, 2)
        : resp.data,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
