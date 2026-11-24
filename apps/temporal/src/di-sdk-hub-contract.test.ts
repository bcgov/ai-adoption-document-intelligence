import {
  createHttpHeaders,
  type PipelineRequest,
} from "@azure/core-rest-pipeline";
import DocumentIntelligence from "@azure-rest/ai-document-intelligence";

describe("installed DI SDK Hub contract", () => {
  it("keeps the tenant prefix exactly once and authenticates submit and poll", async () => {
    const sent: PipelineRequest[] = [];
    const client = DocumentIntelligence(
      "https://hub.example/tenant",
      { key: "fake-key" },
      {
        credentials: { apiKeyHeaderName: "api-key" },
        retryOptions: { maxRetries: 0 },
        httpClient: {
          sendRequest: async (request) => {
            sent.push(request);
            return {
              request,
              status: request.method === "POST" ? 202 : 200,
              headers: createHttpHeaders({
                "content-type": "application/json",
                "operation-location":
                  "https://hub.example/tenant/documentintelligence/documentModels/prebuilt-layout/analyzeResults/result",
              }),
              bodyAsText: JSON.stringify({ status: "succeeded" }),
            };
          },
        },
      },
    );
    await client
      .path("/documentModels/{modelId}:analyze", "prebuilt-layout")
      .post({
        body: { base64Source: "aW1hZ2U=" },
        contentType: "application/json",
      });
    await client
      .path(
        "/documentModels/{modelId}/analyzeResults/{resultId}",
        "prebuilt-layout",
        "result",
      )
      .get();
    await client.path("/documentModels/{modelId}", "group__model").get();
    expect(sent).toHaveLength(3);
    expect(sent.map((request) => new URL(request.url).pathname)).toEqual([
      "/tenant/documentintelligence/documentModels/prebuilt-layout:analyze",
      "/tenant/documentintelligence/documentModels/prebuilt-layout/analyzeResults/result",
      "/tenant/documentintelligence/documentModels/group__model",
    ]);
    for (const request of sent) {
      expect(request.headers.get("api-key")).toBe("fake-key");
      expect(request.headers.has("Ocp-Apim-Subscription-Key")).toBe(false);
      expect(new URL(request.url).searchParams.get("api-version")).toBe(
        "2024-11-30",
      );
    }
  });
});
