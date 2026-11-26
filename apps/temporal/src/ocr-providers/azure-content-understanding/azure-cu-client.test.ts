import {
  createCuAxiosInstance,
  cuAnalyzeResultUrlFromOperation,
  readCuModelDeployments,
} from "./azure-cu-client";

describe("Content Understanding AI Hub client", () => {
  const endpoint = "https://hub.example/tenant";
  const resultPath =
    "/contentunderstanding/analyzerResults/result-123?api-version=2025-11-01";

  it.each([
    "subscription-key",
    "bearer",
  ] as const)("sends the Hub key in api-key for %s mode", (authMode) => {
    const client = createCuAxiosInstance({
      endpoint,
      apiKey: "test-key",
      authMode,
    });
    expect(client.defaults.headers["api-key"]).toBe("test-key");
    expect(
      client.getUri({
        url: "/contentunderstanding/analyzers/a:analyze?api-version=2025-11-01",
      }),
    ).toBe(
      `${endpoint}/contentunderstanding/analyzers/a:analyze?api-version=2025-11-01`,
    );
  });

  it.each([
    `https://hub.example/tenant${resultPath}`,
    `/tenant${resultPath}`,
    `https://hub.example${resultPath}`,
  ])("polls a tenant-scoped operation exactly once: %s", (operationLocation) => {
    const client = createCuAxiosInstance({ endpoint, apiKey: "test-key" });
    const url = cuAnalyzeResultUrlFromOperation(operationLocation, endpoint);
    expect(url).toBe(resultPath);
    expect(client.getUri({ url })).toBe(`${endpoint}${resultPath}`);
  });

  it.each([
    `https://other.example/tenant${resultPath}`,
    `https://hub.example/other${resultPath}`,
    `https://hub.example/tenant/contentunderstanding/analyzers/a`,
    `https://hub.example/tenant/contentunderstanding/analyzerResults/`,
    `https://hub.example/tenant/contentunderstanding/analyzerResults/a/b`,
  ])("rejects operation locations outside the configured tenant: %s", (location) => {
    expect(() => cuAnalyzeResultUrlFromOperation(location, endpoint)).toThrow(
      /invalid operation-location/,
    );
  });

  it("uses the deployment map published by the Hub", () => {
    const map = {
      "prebuilt-analyzer-completion": "gpt-5.4",
      "prebuilt-analyzer-embedding": "text-embedding-3-large",
    };
    expect(readCuModelDeployments(map)).toEqual(map);
  });

  it.each([
    undefined,
    {},
    { "prebuilt-analyzer-completion": 123 },
  ])("rejects missing or invalid Hub deployment maps", (map) => {
    expect(() => readCuModelDeployments(map)).toThrow(/tenant-info/);
  });
});
