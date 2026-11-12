/**
 * Extracts the analyze-result ID only from a valid Hub tenant operation URL.
 *
 * @param operationLocation - Operation URL returned by Document Intelligence.
 * @param endpoint - Configured AI Hub tenant base URL.
 * @returns Decoded analyze-result ID.
 * @throws If the URL is malformed, insecure, outside the tenant, or not an analyze result.
 */
export function getAnalyzeResultId(
  operationLocation: string | undefined,
  endpoint: string,
): string {
  if (!operationLocation) {
    throw new Error("Azure OCR operation-location header not found");
  }

  let operationUrl: URL;
  let endpointUrl: URL;
  try {
    operationUrl = new URL(operationLocation);
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error("Azure OCR returned an invalid operation-location URL");
  }
  if (operationUrl.protocol !== "https:" || endpointUrl.protocol !== "https:") {
    throw new Error("Azure OCR operation-location must use HTTPS");
  }
  if (operationUrl.origin !== endpointUrl.origin) {
    throw new Error(
      `Azure OCR operation-location origin "${operationUrl.origin}" does not match configured AI Hub origin "${endpointUrl.origin}"`,
    );
  }

  const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
  const servicePrefix = `${endpointPath}/documentintelligence/documentModels/`;
  if (!operationUrl.pathname.startsWith(servicePrefix)) {
    throw new Error(
      `Azure OCR operation-location path "${operationUrl.pathname}" is outside the configured AI Hub tenant path`,
    );
  }
  const pathSegments = operationUrl.pathname
    .slice(servicePrefix.length)
    .split("/");
  if (
    pathSegments.length !== 3 ||
    !pathSegments[0] ||
    pathSegments[1] !== "analyzeResults" ||
    !pathSegments[2]
  ) {
    throw new Error(
      `Azure OCR operation-location path "${operationUrl.pathname}" does not identify an analyze result`,
    );
  }
  try {
    return decodeURIComponent(pathSegments[2]);
  } catch {
    throw new Error(
      "Azure OCR operation-location contains an invalid result ID",
    );
  }
}
