import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { CuAnalyzerDefinition } from "./analyzer-schema-builder";
import { azureCuDeployAnalyzer } from "./azure-cu-deploy-analyzer";

jest.mock("../../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const mockCuGet =
  jest.fn<(url: string) => Promise<{ status: number; data: unknown }>>();
const mockCuPut =
  jest.fn<
    (url: string, body: unknown) => Promise<{ status: number; data: unknown }>
  >();
const mockCuDelete =
  jest.fn<(url: string) => Promise<{ status: number; data: unknown }>>();
jest.mock("./azure-cu-client", () => {
  const actual =
    jest.requireActual<typeof import("./azure-cu-client")>("./azure-cu-client");
  return {
    ...actual,
    createCuAxiosInstance: () => ({
      get: mockCuGet,
      put: mockCuPut,
      delete: mockCuDelete,
    }),
  };
});

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

const analyzer = {
  baseAnalyzerId: "prebuilt-document",
  fieldSchema: { fields: {} },
} as unknown as CuAnalyzerDefinition;

describe("azureCuDeployAnalyzer group scope", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockCuGet.mockResolvedValue({ status: 404, data: undefined });
    mockCuPut.mockResolvedValue({ status: 201, data: { status: "ready" } });
  });

  it("refuses an analyzerId outside the run's group", async () => {
    await expect(
      azureCuDeployAnalyzer({
        analyzerId: `diexperiment${OTHER_GROUP}tm1`,
        groupId: GROUP,
        analyzer,
        endpoint: "https://example.cognitiveservices.azure.com",
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/not in group/);
    expect(mockCuGet).not.toHaveBeenCalled();
    expect(mockCuDelete).not.toHaveBeenCalled();
    expect(mockCuPut).not.toHaveBeenCalled();
  });

  it("refuses to deploy without a groupId", async () => {
    await expect(
      azureCuDeployAnalyzer({
        analyzerId: `diexperiment${GROUP}tm1`,
        analyzer,
        endpoint: "https://example.cognitiveservices.azure.com",
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/groupId is required/);
    expect(mockCuGet).not.toHaveBeenCalled();
    expect(mockCuPut).not.toHaveBeenCalled();
  });
});
