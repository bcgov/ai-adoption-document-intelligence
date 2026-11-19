import { azureAnalyzeResultId } from "@ai-di/graph-workflow";

const endpoint = "https://hub.example/tenant";
const location = `${endpoint}/documentintelligence/documentModels/prebuilt-layout/analyzeResults/result-123?api-version=2024-11-30`;

describe("Azure analyze result identity", () => {
  it("uses Operation-Location rather than the gateway correlation ID", () => {
    expect(
      azureAnalyzeResultId(
        {
          "Operation-Location": location,
          "apim-request-id": "different-correlation",
        },
        `${endpoint}/`,
        "prebuilt-layout",
      ),
    ).toBe("result-123");
  });

  it.each([
    ["endpoint suffix", `${endpoint}${"/".repeat(100_000)}`, endpoint],
    [
      "pathname suffix before query",
      `${endpoint}${"/".repeat(100_000)}?api-version=2024-11-30`,
      endpoint,
    ],
    ["root endpoint", "https://hub.example/", "https://hub.example"],
  ])("normalizes trailing slashes: %s", (_name, value, operationEndpoint) => {
    const operationLocation =
      `${operationEndpoint}/documentintelligence/documentModels/` +
      "prebuilt-layout/analyzeResults/result-123";
    expect(
      azureAnalyzeResultId(
        { "operation-location": operationLocation },
        value,
        "prebuilt-layout",
      ),
    ).toBe("result-123");
  });

  it("preserves a long internal slash run when validating the tenant", () => {
    expect(() =>
      azureAnalyzeResultId(
        { "operation-location": location },
        `https://hub.example${"/".repeat(100_000)}tenant`,
        "prebuilt-layout",
      ),
    ).toThrow("does not match the tenant and model");
  });

  it.each([
    undefined,
    "https://evil.example/tenant/documentintelligence/documentModels/prebuilt-layout/analyzeResults/result-123",
    location.replace("/tenant/", "/other/"),
    location.replace("prebuilt-layout", "custom-model"),
    location.replace("/result-123", "/"),
    location.replace("/result-123", "/result/extra"),
    location.replace("/result-123", "/%2e%2e"),
    location.replace("https:", "http:"),
  ])("rejects missing or untrusted operation locations: %s", (value) => {
    expect(() =>
      azureAnalyzeResultId(
        {
          "operation-location": value,
          "apim-request-id": "not-a-result",
        },
        endpoint,
        "prebuilt-layout",
      ),
    ).toThrow();
  });
});
