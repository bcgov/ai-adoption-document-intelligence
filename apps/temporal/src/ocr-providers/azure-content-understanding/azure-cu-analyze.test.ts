import {
  type AzureContentUnderstandingAnalyzeParameters,
  getActivityCatalogEntry,
} from "@ai-di/graph-workflow";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { SameShape } from "../../__testlib__/same-shape";
import type { PreparedFileData } from "../../types";
import {
  __testInternals,
  type AzureCuAnalyzeParams,
  azureCuAnalyze,
} from "./azure-cu-analyze";
import { azureCuDeployAnalyzer } from "./azure-cu-deploy-analyzer";
import type { CuAnalyzeOperation, CuAnalyzeResult } from "./cu-types";

jest.mock("../../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const mockBlobRead = jest.fn<(key: string) => Promise<Buffer>>();
const ocrBodies = new Map<string, Buffer>();
const mockBlobWrite = jest.fn<(key: string, value: Buffer) => Promise<void>>();
jest.mock("../../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    write: mockBlobWrite,
  }),
}));

jest.mock("./azure-cu-deploy-analyzer", () => ({
  azureCuDeployAnalyzer: jest.fn(),
}));
const deployAnalyzerMock = azureCuDeployAnalyzer as jest.MockedFunction<
  typeof azureCuDeployAnalyzer
>;

const mockCuPost =
  jest.fn<
    (
      url: string,
      body: unknown,
    ) => Promise<{
      status: number;
      headers: Record<string, string>;
      data: unknown;
    }>
  >();
const mockCuGet =
  jest.fn<(url: string) => Promise<{ status: number; data: unknown }>>();
jest.mock("./azure-cu-client", () => {
  const actual =
    jest.requireActual<typeof import("./azure-cu-client")>("./azure-cu-client");
  return {
    ...actual,
    createCuAxiosInstance: () => ({ post: mockCuPost, get: mockCuGet }),
  };
});

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

interface TemplateRow {
  id: string;
  group_id: string;
  field_schema: Array<{
    field_key: string;
    field_type: string;
    field_format: string | null;
    display_order: number;
  }>;
}

/** In-memory `template_models` table behind the mocked Prisma delegate. */
let templateRows: TemplateRow[] = [];
const mockFindUnique =
  jest.fn<(args: { where: { id: string } }) => Promise<TemplateRow | null>>();
const mockFindFirst =
  jest.fn<
    (args: {
      where: { id: string; group_id?: string };
    }) => Promise<TemplateRow | null>
  >();
jest.mock("../../activities/database-client", () => ({
  getPrismaClient: () => ({
    templateModel: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
    },
  }),
}));

const { extractInlineResult } = __testInternals;

type InlineBody = CuAnalyzeOperation & CuAnalyzeResult;

describe("extractInlineResult — CU synchronous-200 handling (B2)", () => {
  it("returns the result from a long-running-operation envelope", () => {
    const result: CuAnalyzeResult = { analyzerId: "a", contents: [] };
    const body = { status: "Succeeded", result } as InlineBody;
    expect(extractInlineResult(body)).toBe(result);
  });

  it("returns a bare CuAnalyzeResult (contents at the top level)", () => {
    // This is the shape the old code silently dropped (cast to the envelope,
    // status/result undefined → fell through to polling).
    const body = { analyzerId: "a", contents: [] } as InlineBody;
    expect(extractInlineResult(body)).toBe(body);
  });

  it("returns undefined for a non-terminal operation (no inline result)", () => {
    expect(
      extractInlineResult({ status: "Running" } as InlineBody),
    ).toBeUndefined();
  });

  it("returns undefined for an empty body", () => {
    expect(extractInlineResult({} as InlineBody)).toBeUndefined();
  });
});

describe("azureCuAnalyze group scope", () => {
  const originalEnv = process.env;

  const pdfFile: PreparedFileData = {
    fileName: "doc.pdf",
    fileType: "pdf",
    contentType: "application/pdf",
    blobKey: `${GROUP}/ocr/doc-1/original.pdf`,
    modelId: "prebuilt-layout",
  };

  function amountTemplate(groupId: string): TemplateRow {
    return {
      id: "tm-1",
      group_id: groupId,
      field_schema: [
        {
          field_key: "amount",
          field_type: "number",
          field_format: null,
          display_order: 0,
        },
      ],
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    ocrBodies.clear();
    mockBlobWrite.mockImplementation(async (key, value) => {
      ocrBodies.set(key, value);
    });
    process.env = {
      ...originalEnv,
      MOCK_AZURE_CU: "false",
      AZURE_CU_ENDPOINT: "https://example.cognitiveservices.azure.com",
      AZURE_CU_KEY: "test-key",
    };
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4"));
    templateRows = [];
    mockFindUnique.mockImplementation(
      async ({ where }) => templateRows.find((r) => r.id === where.id) ?? null,
    );
    mockFindFirst.mockImplementation(
      async ({ where }) =>
        templateRows.find(
          (r) =>
            r.id === where.id &&
            (where.group_id === undefined || r.group_id === where.group_id),
        ) ?? null,
    );
    deployAnalyzerMock.mockResolvedValue({
      analyzerId: "diexperimenttm1",
      status: "deployed",
      bodyHash: "hash",
    });
    mockCuPost.mockResolvedValue({
      status: 200,
      headers: {},
      data: { status: "Succeeded", result: { contents: [] } },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("builds the analyzer from a template model in the run's group", async () => {
    templateRows = [amountTemplate(GROUP)];

    await azureCuAnalyze({
      documentId: "doc-1",
      fileData: pdfFile,
      groupId: GROUP,
      templateModelId: "tm-1",
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "tm-1", group_id: GROUP },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });
    expect(deployAnalyzerMock).toHaveBeenCalledTimes(1);
  });

  it("deploys the template analyzer under the run's group", async () => {
    templateRows = [amountTemplate(GROUP)];

    await azureCuAnalyze({
      documentId: "doc-1",
      fileData: pdfFile,
      groupId: GROUP,
      templateModelId: "tm-1",
    });

    expect(deployAnalyzerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzerId: `diexperiment${GROUP}tm1`,
        groupId: GROUP,
      }),
    );
    expect(mockCuPost.mock.calls[0][0]).toContain(
      `/analyzers/diexperiment${GROUP}tm1:analyze`,
    );
  });

  it("refuses an explicit analyzerId outside the run's group", async () => {
    templateRows = [amountTemplate(GROUP)];

    await expect(
      azureCuAnalyze({
        documentId: "doc-1",
        fileData: pdfFile,
        groupId: GROUP,
        templateModelId: "tm-1",
        analyzerId: `diexperiment${OTHER_GROUP}tm1`,
      }),
    ).rejects.toThrow(/not in group/);
    expect(deployAnalyzerMock).not.toHaveBeenCalled();
    expect(mockCuPost).not.toHaveBeenCalled();
  });

  it("accepts an explicit prebuilt analyzerId", async () => {
    await azureCuAnalyze({
      documentId: "doc-1",
      fileData: pdfFile,
      groupId: GROUP,
      analyzerId: "prebuilt-documentSearch",
    });
    expect(mockCuPost.mock.calls[0][0]).toContain(
      "/analyzers/prebuilt-documentSearch:analyze",
    );
  });

  it.each([
    "/tenant/contentunderstanding/analyzerResults/result-123?api-version=2025-11-01",
    "/contentunderstanding/analyzerResults/result-123?api-version=2025-11-01",
  ])("polls the Hub operation without duplicating the tenant path: %s", async (location) => {
    process.env.AZURE_CU_ENDPOINT = "https://hub.example/tenant";
    mockCuPost.mockResolvedValue({
      status: 202,
      headers: {
        "operation-location": `https://hub.example${location}`,
      },
      data: {},
    });
    mockCuGet.mockResolvedValue({
      status: 200,
      data: { status: "Succeeded", result: { contents: [] } },
    });
    const result = await azureCuAnalyze({
      documentId: "doc-1",
      fileData: pdfFile,
      groupId: GROUP,
      analyzerId: "prebuilt-layout",
    });
    expect(mockCuGet).toHaveBeenCalledWith(
      "/contentunderstanding/analyzerResults/result-123?api-version=2025-11-01",
    );
    expect(result.ocrResult.blobPath).toContain(`${GROUP}/`);
    expect(result.ocrResponse.blobPath).toContain(`${GROUP}/`);
    const raw = ocrBodies.get(result.ocrResponse.blobPath);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw?.toString("utf8") ?? "{}").status).toBe("Succeeded");
  });

  it("does not poll another tenant's operation", async () => {
    process.env.AZURE_CU_ENDPOINT = "https://hub.example/tenant";
    mockCuPost.mockResolvedValue({
      status: 202,
      headers: {
        "operation-location":
          "https://hub.example/other/contentunderstanding/analyzerResults/result-123?api-version=2025-11-01",
      },
      data: {},
    });
    await expect(
      azureCuAnalyze({
        documentId: "doc-1",
        fileData: pdfFile,
        groupId: GROUP,
        analyzerId: "prebuilt-layout",
      }),
    ).rejects.toThrow(/invalid operation-location/);
    expect(mockCuGet).not.toHaveBeenCalled();
  });

  it("treats a template model from another group as not found", async () => {
    templateRows = [amountTemplate(OTHER_GROUP)];

    const { ocrResult } = await azureCuAnalyze({
      documentId: "doc-1",
      fileData: pdfFile,
      groupId: GROUP,
      templateModelId: "tm-1",
    });

    expect(deployAnalyzerMock).not.toHaveBeenCalled();
    const body = ocrBodies.get(ocrResult.blobPath);
    expect(body).toBeDefined();
    expect(JSON.parse(body?.toString("utf8") ?? "{}").success).toBe(true);
  });

  it("reads the document from the run's group", async () => {
    await azureCuAnalyze({
      documentId: "doc-1",
      fileData: pdfFile,
      groupId: GROUP,
    });

    expect(mockBlobRead).toHaveBeenCalledWith(pdfFile.blobKey);
    expect(mockCuPost).toHaveBeenCalledTimes(1);
  });

  it("refuses a document blob that belongs to another group", async () => {
    await expect(
      azureCuAnalyze({
        documentId: "doc-1",
        fileData: {
          ...pdfFile,
          blobKey: `${OTHER_GROUP}/ocr/doc-1/original.pdf`,
        },
        groupId: GROUP,
      }),
    ).rejects.toThrow(/does not belong to group/);
    expect(mockBlobRead).not.toHaveBeenCalled();
    expect(mockCuPost).not.toHaveBeenCalled();
  });

  it("refuses to run without a groupId", async () => {
    templateRows = [amountTemplate(GROUP)];

    await expect(
      azureCuAnalyze({
        documentId: "doc-1",
        fileData: pdfFile,
        templateModelId: "tm-1",
      }),
    ).rejects.toThrow(/groupId is required/);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(deployAnalyzerMock).not.toHaveBeenCalled();
    expect(mockBlobRead).not.toHaveBeenCalled();
    expect(mockCuPost).not.toHaveBeenCalled();
  });

  describe("catalog contract", () => {
    // The engine copies result[port] into the variable each output binding
    // names, so a port the catalog declares but the activity does not return
    // is written as an empty value, and the next step reads nothing.
    it("returns every output port the catalog declares for it", async () => {
      templateRows = [amountTemplate(GROUP)];

      const result = await azureCuAnalyze({
        documentId: "doc-1",
        fileData: pdfFile,
        groupId: GROUP,
        templateModelId: "tm-1",
      });
      const declared = getActivityCatalogEntry(
        "azureContentUnderstanding.analyze",
      )?.outputs.map((port) => port.name);

      expect(declared).toContain("ocrResult");
      expect(Object.keys(result)).toEqual(
        expect.arrayContaining(declared ?? []),
      );
    });

    it("describes exactly the parameters the activity takes", () => {
      const agree: SameShape<
        AzureContentUnderstandingAnalyzeParameters,
        Omit<
          AzureCuAnalyzeParams,
          | "fileData"
          | "documentId"
          | "groupId"
          | "templateModelId"
          | "requestId"
        >
      > = true;
      expect(agree).toBe(true);
    });
  });
});
