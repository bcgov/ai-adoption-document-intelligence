/**
 * The standard OCR templates publish `modelId` as a run input.
 *
 * Their OCR steps read the model from the `modelId` workflow variable, which
 * no step writes: the upload request sends the model the person picked, and
 * the declaration's default fills in when a run starts without one. Flagging
 * the variable `isInput` puts it in the run contract that
 * `GET /api/workflows/:id/run-spec` publishes and the builder's Run panel
 * lists. The default keeps it optional, so a caller that never sends it still
 * passes `POST /runs` validation. Pure JSON inspection, no database.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { deriveInputSchema } from "./derive-input-schema";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "docs-md/workflows/templates");

const TEMPLATES = [
  "standard-ocr-workflow.json",
  "standard-ocr-workflow-normalize.json",
  "standard-ocr-workflow-sdpr.json",
  "standard-ocr-workflow-with-corrections.json",
  "standard-ocr-workflow-with-payment-lookup.json",
  "mistral-standard-ocr-workflow.json",
];

describe.each(TEMPLATES)("%s", (fileName) => {
  const config = JSON.parse(
    fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf-8"),
  ) as GraphWorkflowConfig;
  const schema = deriveInputSchema(config);

  it("lists modelId in its run contract, with the template's default", () => {
    expect(config.ctx.modelId?.defaultValue).toEqual(expect.any(String));
    expect(schema.properties.modelId).toEqual({
      type: "string",
      default: config.ctx.modelId?.defaultValue,
    });
  });

  it("keeps modelId optional, so callers that never send it still validate", () => {
    expect(schema.required).not.toContain("modelId");
  });
});
