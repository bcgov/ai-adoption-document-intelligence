import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { PreparedFileData } from "../../types";
import { __testInternals, azureCuAnalyze } from "./azure-cu-analyze";
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
jest.mock("../../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
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
jest.mock("./azure-cu-client", () => {
  const actual =
    jest.requireActual<typeof import("./azure-cu-client")>("./azure-cu-client");
  return {
    ...actual,
    createCuAxiosInstance: () => ({ post: mockCuPost, get: jest.fn() }),
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
      fileData: pdfFile,
      groupId: GROUP,
      analyzerId: "prebuilt-documentSearch",
    });

    expect(mockCuPost.mock.calls[0][0]).toContain(
      "/analyzers/prebuilt-documentSearch:analyze",
    );
  });

  it("treats a template model from another group as not found", async () => {
    templateRows = [amountTemplate(OTHER_GROUP)];

    const { ocrResult } = await azureCuAnalyze({
      fileData: pdfFile,
      groupId: GROUP,
      templateModelId: "tm-1",
    });

    expect(deployAnalyzerMock).not.toHaveBeenCalled();
    expect(ocrResult.success).toBe(true);
  });

  it("reads the document from the run's group", async () => {
    await azureCuAnalyze({ fileData: pdfFile, groupId: GROUP });

    expect(mockBlobRead).toHaveBeenCalledWith(pdfFile.blobKey);
    expect(mockCuPost).toHaveBeenCalledTimes(1);
  });

  it("refuses a document blob that belongs to another group", async () => {
    await expect(
      azureCuAnalyze({
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
      azureCuAnalyze({ fileData: pdfFile, templateModelId: "tm-1" }),
    ).rejects.toThrow(/groupId is required/);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(deployAnalyzerMock).not.toHaveBeenCalled();
    expect(mockBlobRead).not.toHaveBeenCalled();
    expect(mockCuPost).not.toHaveBeenCalled();
  });
});
