import { readAiHubConfig } from "./ai-hub-config";

describe("readAiHubConfig", () => {
  it("trims and normalizes the shared tenant configuration", () => {
    expect(
      readAiHubConfig({
        AI_HUB_ENDPOINT:
          " https://test.aihub.gov.bc.ca/sdpr-invoice-automation/// ",
        AI_HUB_API_KEY: " test-key ",
      }),
    ).toEqual({
      endpoint: "https://test.aihub.gov.bc.ca/sdpr-invoice-automation",
      apiKey: "test-key",
    });
  });

  it.each([
    [{ AI_HUB_API_KEY: "test-key" }],
    [{ AI_HUB_ENDPOINT: "https://test.aihub.gov.bc.ca" }],
    [{ AI_HUB_ENDPOINT: " ", AI_HUB_API_KEY: " " }],
  ])("rejects incomplete configuration", (env) => {
    expect(() => readAiHubConfig(env)).toThrow(
      "AI Hub configuration missing. Set AI_HUB_ENDPOINT and AI_HUB_API_KEY.",
    );
  });
});
