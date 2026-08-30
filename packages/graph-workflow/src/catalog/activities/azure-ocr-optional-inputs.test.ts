import { getActivityCatalogEntry } from "../index";

/**
 * The Azure OCR poll/extract runtime derives these from `fileData` /
 * defaults them (`modelId` → `prebuilt-layout`; `fileName`/`fileType` are
 * log-only — see apps/temporal/src/activities/{poll,extract}-ocr-results.ts).
 * They must therefore be declared OPTIONAL inputs, or a validly-built OCR
 * chain fails validation for inputs the runtime never actually needs bound.
 */
function required(activityType: string, portName: string): boolean {
  const entry = getActivityCatalogEntry(activityType);
  const port = entry?.inputs.find((p) => p.name === portName);
  if (!port) throw new Error(`${activityType} has no input ${portName}`);
  return port.required === true;
}

describe("Azure OCR runtime-derived inputs are optional", () => {
  it("azureOcr.poll.modelId is optional (runtime defaults to prebuilt-layout)", () => {
    expect(required("azureOcr.poll", "modelId")).toBe(false);
    // apimRequestId is genuinely required (and auto-wires by name).
    expect(required("azureOcr.poll", "apimRequestId")).toBe(true);
  });

  it("azureOcr.extract modelId/fileName/fileType are optional", () => {
    expect(required("azureOcr.extract", "modelId")).toBe(false);
    expect(required("azureOcr.extract", "fileName")).toBe(false);
    expect(required("azureOcr.extract", "fileType")).toBe(false);
    expect(required("azureOcr.extract", "apimRequestId")).toBe(true);
  });
});
