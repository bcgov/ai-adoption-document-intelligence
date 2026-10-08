jest.mock("../../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

import axios from "axios";
import type { OCRResponse, PreparedFileData } from "../../types";
import { vlmHybridExtract } from "./vlm-hybrid-extract";

jest.mock("axios");
const axiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

const mockBlobRead = jest.fn();
jest.mock("../../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

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
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
jest.mock("../../activities/database-client", () => ({
  getPrismaClient: () => ({
    templateModel: {
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
    },
  }),
}));

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

const imageFile: PreparedFileData = {
  fileName: "scan.jpg",
  fileType: "image",
  contentType: "image/jpeg",
  blobKey: `${GROUP}/ocr/doc-1/original.jpg`,
  modelId: "prebuilt-layout",
};

const layoutResponse: OCRResponse = {
  status: "succeeded",
  analyzeResult: {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    content: "Amount 12",
    pages: [],
    paragraphs: [],
    tables: [],
    keyValuePairs: [],
    sections: [],
    figures: [],
  },
};

describe("vlmHybridExtract group scope", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      MOCK_VLM_DIRECT: "false",
      AZURE_OPENAI_ENDPOINT: "https://example.cognitiveservices.azure.com",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_DEPLOYMENT: "test-deployment",
    };
    mockBlobRead.mockResolvedValue(Buffer.from("image-bytes"));
    templateRows = [];
    mockFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        templateRows.find((r) => r.id === where.id) ?? null,
    );
    mockFindFirst.mockImplementation(
      async ({ where }: { where: { id: string; group_id?: string } }) =>
        templateRows.find(
          (r) =>
            r.id === where.id &&
            (where.group_id === undefined || r.group_id === where.group_id),
        ) ?? null,
    );
    axiosPost.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                fields: { amount: 12 },
                source_quotes: { amount: "12" },
              }),
            },
          },
        ],
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads the template model only within the run's group", async () => {
    templateRows = [amountTemplate(GROUP)];

    const { ocrResult } = await vlmHybridExtract({
      fileData: imageFile,
      groupId: GROUP,
      layoutResponse,
      templateModelId: "tm-1",
    });

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "tm-1", group_id: GROUP },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });
    expect(ocrResult.success).toBe(true);
  });

  it("treats a template model from another group as not found", async () => {
    templateRows = [amountTemplate(OTHER_GROUP)];

    await expect(
      vlmHybridExtract({
        fileData: imageFile,
        groupId: GROUP,
        layoutResponse,
        templateModelId: "tm-1",
      }),
    ).rejects.toThrow(/template field_schema not found/);
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("reads the document from the run's group", async () => {
    templateRows = [amountTemplate(GROUP)];

    await vlmHybridExtract({
      fileData: imageFile,
      groupId: GROUP,
      layoutResponse,
      templateModelId: "tm-1",
    });

    expect(mockBlobRead).toHaveBeenCalledWith(imageFile.blobKey);
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it("refuses a document blob that belongs to another group", async () => {
    templateRows = [amountTemplate(GROUP)];

    await expect(
      vlmHybridExtract({
        fileData: {
          ...imageFile,
          blobKey: `${OTHER_GROUP}/ocr/doc-1/original.jpg`,
        },
        groupId: GROUP,
        layoutResponse,
        templateModelId: "tm-1",
      }),
    ).rejects.toThrow(/does not belong to group/);
    expect(mockBlobRead).not.toHaveBeenCalled();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("refuses a layout response ref from another group", async () => {
    templateRows = [amountTemplate(GROUP)];

    await expect(
      vlmHybridExtract({
        fileData: imageFile,
        groupId: GROUP,
        layoutResponse: {
          documentId: "doc-1",
          blobPath: `${OTHER_GROUP}/ocr/doc-1/azure-response.json`,
          storage: "blob",
          status: "succeeded",
        },
        templateModelId: "tm-1",
      }),
    ).rejects.toThrow(/does not belong to group/);
    expect(mockBlobRead).not.toHaveBeenCalled();
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("refuses to run without a groupId", async () => {
    templateRows = [amountTemplate(GROUP)];

    await expect(
      vlmHybridExtract({
        fileData: imageFile,
        layoutResponse,
        templateModelId: "tm-1",
      }),
    ).rejects.toThrow(/groupId is required/);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockBlobRead).not.toHaveBeenCalled();
    expect(axiosPost).not.toHaveBeenCalled();
  });
});
