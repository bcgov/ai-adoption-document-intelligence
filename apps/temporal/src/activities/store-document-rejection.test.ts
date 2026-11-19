import { ApplicationFailure } from "@temporalio/common";
import { getPrismaClient } from "./database-client";
import { storeDocumentRejection } from "./store-document-rejection";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const GROUP = "clh7z2xk00000356u8e3h1234";

describe("storeDocumentRejection activity", () => {
  let prismaMock: {
    document: {
      findFirst: jest.Mock;
    };
    documentRejection: {
      upsert: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        findFirst: jest.fn().mockResolvedValue({ id: "doc" }),
      },
      documentRejection: {
        upsert: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("stores document rejection with all fields", async () => {
    prismaMock.documentRejection.upsert.mockResolvedValue({
      id: 1,
      document_id: "doc-1",
      reason: "poor_quality",
      reviewer: "user@example.com",
      annotations: "Image too blurry",
    });

    await storeDocumentRejection({
      documentId: "doc-1",
      groupId: GROUP,
      reason: "poor_quality",
      reviewer: "user@example.com",
      annotations: "Image too blurry",
    });

    expect(prismaMock.documentRejection.upsert).toHaveBeenCalledWith({
      where: { document_id: "doc-1" },
      update: {
        reason: "poor_quality",
        reviewer: "user@example.com",
        annotations: "Image too blurry",
      },
      create: {
        document_id: "doc-1",
        reason: "poor_quality",
        reviewer: "user@example.com",
        annotations: "Image too blurry",
      },
    });
  });

  it("stores document rejection with only reason", async () => {
    prismaMock.documentRejection.upsert.mockResolvedValue({
      id: 2,
      document_id: "doc-2",
      reason: "invalid_format",
      reviewer: null,
      annotations: null,
    });

    await storeDocumentRejection({
      documentId: "doc-2",
      groupId: GROUP,
      reason: "invalid_format",
    });

    expect(prismaMock.documentRejection.upsert).toHaveBeenCalledWith({
      where: { document_id: "doc-2" },
      update: {
        reason: "invalid_format",
        reviewer: null,
        annotations: null,
      },
      create: {
        document_id: "doc-2",
        reason: "invalid_format",
        reviewer: null,
        annotations: null,
      },
    });
  });

  it("updates existing rejection record", async () => {
    prismaMock.documentRejection.upsert.mockResolvedValue({
      id: 3,
      document_id: "doc-3",
      reason: "incorrect_data",
      reviewer: "reviewer@example.com",
      annotations: "Updated annotations",
    });

    await storeDocumentRejection({
      documentId: "doc-3",
      groupId: GROUP,
      reason: "incorrect_data",
      reviewer: "reviewer@example.com",
      annotations: "Updated annotations",
    });

    expect(prismaMock.documentRejection.upsert).toHaveBeenCalled();
  });

  it("throws error when database operation fails", async () => {
    const dbError = new Error("Database connection failed");
    prismaMock.documentRejection.upsert.mockRejectedValue(dbError);

    await expect(
      storeDocumentRejection({
        documentId: "doc-4",
        groupId: GROUP,
        reason: "poor_quality",
      }),
    ).rejects.toThrow("Database connection failed");
  });

  it("looks the document up within the run's group before writing", async () => {
    await storeDocumentRejection({
      documentId: "doc-5",
      groupId: GROUP,
      reason: "poor_quality",
    });

    expect(prismaMock.document.findFirst).toHaveBeenCalledWith({
      where: { id: "doc-5", group_id: GROUP },
      select: { id: true },
    });
  });

  it("refuses a document outside the run's group without writing or retrying", async () => {
    prismaMock.document.findFirst.mockResolvedValue(null);

    const failure = await storeDocumentRejection({
      documentId: "doc-other-group",
      groupId: GROUP,
      reason: "poor_quality",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect((failure as ApplicationFailure).message).toBe(
      "Document not found: doc-other-group",
    );
    expect((failure as ApplicationFailure).nonRetryable).toBe(true);
    expect(prismaMock.documentRejection.upsert).not.toHaveBeenCalled();
  });

  it("refuses to write without a groupId", async () => {
    await expect(
      storeDocumentRejection({ documentId: "doc-6", reason: "poor_quality" }),
    ).rejects.toThrow(/groupId is required/);
    expect(prismaMock.document.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.documentRejection.upsert).not.toHaveBeenCalled();
  });
});
