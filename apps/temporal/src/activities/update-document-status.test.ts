import { getPrismaClient } from "./database-client";
import { updateDocumentStatus } from "./update-document-status";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const GROUP_ID = "group-1";

describe("updateDocumentStatus activity", () => {
  let prismaMock: {
    document: {
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("updates document status without apimRequestId", async () => {
    await updateDocumentStatus({
      documentId: "doc-1",
      groupId: GROUP_ID,
      status: "ongoing_ocr",
    });

    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", group_id: GROUP_ID },
      data: { status: "ongoing_ocr" },
    });
  });

  it("updates document status with apimRequestId", async () => {
    await updateDocumentStatus({
      documentId: "doc-2",
      groupId: GROUP_ID,
      status: "ongoing_ocr",
      apimRequestId: "test-apim-id",
    });

    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-2", group_id: GROUP_ID },
      data: {
        status: "ongoing_ocr",
        apim_request_id: "test-apim-id",
      },
    });
  });

  it("updates to extracted status", async () => {
    await updateDocumentStatus({
      documentId: "doc-3",
      groupId: GROUP_ID,
      status: "extracted",
    });

    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-3", group_id: GROUP_ID },
      data: { status: "extracted" },
    });
  });

  it("updates the document only within the run's group", async () => {
    await updateDocumentStatus({
      documentId: "doc-1",
      groupId: "group-2",
      status: "complete",
    });

    expect(prismaMock.document.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.document.updateMany.mock.calls[0][0].where).toEqual({
      id: "doc-1",
      group_id: "group-2",
    });
  });

  it("skips without error when the document is not in the run's group", async () => {
    prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateDocumentStatus({
        documentId: "doc-in-group-2",
        groupId: GROUP_ID,
        status: "complete",
      }),
    ).resolves.toBeUndefined();
  });

  it("skips without error for a benchmark document id that has no row", async () => {
    prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateDocumentStatus({
        documentId: "benchmark-Receipt",
        groupId: GROUP_ID,
        status: "ongoing_ocr",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws when groupId is missing and does not touch the database", async () => {
    await expect(
      updateDocumentStatus({ documentId: "doc-1", status: "complete" }),
    ).rejects.toThrow("groupId is required");

    expect(prismaMock.document.updateMany).not.toHaveBeenCalled();
  });

  it("throws error when database update fails", async () => {
    const dbError = new Error("Database connection failed");
    prismaMock.document.updateMany.mockRejectedValue(dbError);

    await expect(
      updateDocumentStatus({
        documentId: "doc-4",
        groupId: GROUP_ID,
        status: "ongoing_ocr",
      }),
    ).rejects.toThrow("Database connection failed");
  });
});
