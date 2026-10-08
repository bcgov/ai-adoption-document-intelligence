import { getPrismaClient } from "./database-client";
import { getDocumentStatus } from "./get-document-status";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe("getDocumentStatus activity", () => {
  let prismaMock: {
    document: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        findFirst: jest.fn().mockResolvedValue({ status: "extracted" }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("returns the document status", async () => {
    await expect(
      getDocumentStatus({ documentId: "doc-1", groupId: "group-1" }),
    ).resolves.toEqual({ status: "extracted" });
  });

  it("reads the document only within the run's group", async () => {
    await getDocumentStatus({ documentId: "doc-1", groupId: "group-1" });

    expect(prismaMock.document.findFirst).toHaveBeenCalledWith({
      where: { id: "doc-1", group_id: "group-1" },
      select: { status: true },
    });
  });

  it("throws not found when the document is not in the run's group", async () => {
    prismaMock.document.findFirst.mockResolvedValue(null);

    await expect(
      getDocumentStatus({ documentId: "doc-in-group-2", groupId: "group-1" }),
    ).rejects.toThrow("Document doc-in-group-2 not found");
  });

  it("throws when groupId is missing and does not touch the database", async () => {
    await expect(getDocumentStatus({ documentId: "doc-1" })).rejects.toThrow(
      "groupId is required",
    );

    expect(prismaMock.document.findFirst).not.toHaveBeenCalled();
  });
});
