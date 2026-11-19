/**
 * Extracts an analyze result ID from Azure's Operation-Location, not the
 * gateway's unrelated correlation ID. Shared by OCR activity clients; never
 * follows the supplied URL.
 *
 * @param headers - Submission response headers.
 * @param endpoint - Configured tenant-root endpoint.
 * @param modelId - Model used for the submission.
 * @returns The opaque result ID required by the existing polling contract.
 */
export function azureAnalyzeResultId(
  headers: Record<string, unknown>,
  endpoint: string,
  modelId: string,
): string {
  const location = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "operation-location",
  )?.[1];
  if (typeof location !== "string") {
    throw new Error("Azure analyze response missing Operation-Location");
  }
  const base = new URL(endpoint.replace(/\/+$/, ""));
  const operation = new URL(location);
  const prefix = `${base.pathname.replace(/\/+$/, "")}/documentintelligence/documentModels/${encodeURIComponent(modelId)}/analyzeResults/`;
  if (
    base.protocol !== "https:" ||
    operation.origin !== base.origin ||
    operation.username ||
    operation.password ||
    operation.hash ||
    !operation.pathname.startsWith(prefix)
  ) {
    throw new Error(
      "Azure analyze Operation-Location does not match the tenant and model",
    );
  }
  const resultId = operation.pathname.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(resultId)) {
    throw new Error(
      "Azure analyze Operation-Location has an invalid result ID",
    );
  }
  return resultId;
}
