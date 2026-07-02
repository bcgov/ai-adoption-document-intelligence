/**
 * Single-document smoke test for the Mistral Document AI Foundry path.
 *
 * Usage (from apps/temporal):
 *   npx tsx src/scripts/test-mistral-foundry-single.ts [sampleId]
 *
 * Calls Foundry once for one sample and prints whether `document_annotation`
 * comes back populated. Used to verify schema fixes (e.g. `strict: true`)
 * without burning a full 33-sample benchmark run.
 */

import "../env-loader";
import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import { getPrismaClient } from "../activities/database-client";
import { fieldDefinitionsToMistralDocumentAnnotationFormat } from "../ocr-providers/mistral/field-definitions-to-mistral-annotation-format";

const FOUNDRY_PATH = "/providers/mistral/azure/ocr";
const TEMPLATE_MODEL_ID = "seed-sdpr-monthly-report-template";
const DEFAULT_SAMPLE_ID = "1 81";
const SAMPLES_DIR =
  "/tmp/benchmark-cache/seed-local-samples-mix-public-seed-local-samples-mix-public-v1/inputs";

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

  const filePath = path.join(SAMPLES_DIR, `${sampleId}.jpg`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sample not found at ${filePath}`);
  }
  const buffer = await fs.promises.readFile(filePath);
  const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;

  const prisma = getPrismaClient();
  const tm = await prisma.templateModel.findUnique({
    where: { id: TEMPLATE_MODEL_ID },
    include: { field_schema: { orderBy: { display_order: "asc" } } },
  });
  if (!tm) {
    throw new Error(`Template ${TEMPLATE_MODEL_ID} not found.`);
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
  const annotationFormat =
    fieldDefinitionsToMistralDocumentAnnotationFormat(fieldDefs);

  const url = `${endpoint}${FOUNDRY_PATH}`;
  console.log("→ POST", url);
  console.log("  fields in schema:", fieldDefs.length);
  console.log(
    "  json_schema.strict:",
    annotationFormat?.json_schema.strict,
    "  schema.additionalProperties:",
    annotationFormat?.json_schema.schema.additionalProperties,
  );

  const t0 = Date.now();
  const { data } = await axios.post(
    url,
    {
      model: "mistral-document-ai-2512",
      document: { type: "document_url", document_url: dataUrl },
      document_annotation_format: annotationFormat,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 600_000,
      validateStatus: (s) => s === 200,
    },
  );
  const elapsedMs = Date.now() - t0;

  console.log(`← 200 in ${elapsedMs}ms`);
  console.log("  model:", data.model);
  console.log("  pages_processed:", data.usage_info?.pages_processed);
  console.log(
    "  pages_processed_annotation:",
    data.usage_info?.pages_processed_annotation,
  );
  console.log(
    "  document_annotation:",
    data.document_annotation === null
      ? "NULL (annotation step skipped)"
      : `populated (${typeof data.document_annotation === "string" ? data.document_annotation.length : "?"} chars)`,
  );

  if (typeof data.document_annotation === "string") {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(data.document_annotation);
    } catch (_e) {
      console.log("  (could not JSON.parse document_annotation)");
    }
    const populated = Object.entries(parsed).filter(
      ([, v]) => v !== null && v !== "" && v !== undefined,
    );
    console.log(
      `  parsed fields: ${Object.keys(parsed).length} total, ${populated.length} non-empty`,
    );
    console.log("  first 10 non-empty:");
    for (const [k, v] of populated.slice(0, 10)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`);
    }
  }

  // Save raw response for diffing.
  const outPath = path.join(
    __dirname,
    "..",
    "__fixtures__",
    "experiment-02",
    `mistral-azure-ocr-response-${sampleId}-smoketest.json`,
  );
  await fs.promises.writeFile(outPath, JSON.stringify(data, null, 2));
  console.log("  saved raw response to:", outPath);
}

main()
  .catch((err) => {
    if (axios.isAxiosError(err)) {
      console.error("HTTP error:", err.response?.status, err.message);
      console.error("body:", err.response?.data);
    } else {
      console.error(err);
    }
    process.exit(1);
  })
  .finally(() => {
    void getPrismaClient().$disconnect?.();
  });
