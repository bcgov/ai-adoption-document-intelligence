import { getGroupBlobStorage } from "./group-blob-storage";

const mockClient = {
  read: jest.fn(),
  write: jest.fn(),
  exists: jest.fn(),
  delete: jest.fn(),
  list: jest.fn(),
  generateSasUrl: jest.fn(),
};
jest.mock("./blob-storage-client", () => ({
  getBlobStorageClient: () => mockClient,
}));

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";
const OWN_KEY = `${GROUP}/ocr/doc-1/normalized.pdf`;
const OTHER_KEY = `${OTHER_GROUP}/ocr/doc-1/normalized.pdf`;

describe("getGroupBlobStorage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("refuses to bind without a groupId", () => {
    expect(() => getGroupBlobStorage(undefined)).toThrow(/groupId is required/);
    expect(() => getGroupBlobStorage(null)).toThrow(/groupId is required/);
  });

  it("passes keys in the group through to the client", async () => {
    mockClient.read.mockResolvedValue(Buffer.from("data"));
    mockClient.exists.mockResolvedValue(true);
    mockClient.list.mockResolvedValue([OWN_KEY]);
    mockClient.generateSasUrl.mockResolvedValue("https://example/sas");
    const storage = getGroupBlobStorage(GROUP);

    await storage.read(OWN_KEY);
    await storage.write(OWN_KEY, Buffer.from("data"));
    await storage.exists(OWN_KEY);
    await storage.delete(OWN_KEY);
    await storage.list(`${GROUP}/ocr/doc-1`);
    await storage.generateSasUrl(OWN_KEY, 30);

    expect(mockClient.read).toHaveBeenCalledWith(OWN_KEY);
    expect(mockClient.write).toHaveBeenCalledWith(OWN_KEY, Buffer.from("data"));
    expect(mockClient.exists).toHaveBeenCalledWith(OWN_KEY);
    expect(mockClient.delete).toHaveBeenCalledWith(OWN_KEY);
    expect(mockClient.list).toHaveBeenCalledWith(`${GROUP}/ocr/doc-1`);
    expect(mockClient.generateSasUrl).toHaveBeenCalledWith(OWN_KEY, 30);
  });

  it("refuses keys and prefixes from another group without calling the client", async () => {
    const storage = getGroupBlobStorage(GROUP);

    await expect(storage.read(OTHER_KEY)).rejects.toThrow(
      /does not belong to group/,
    );
    await expect(storage.write(OTHER_KEY, Buffer.from("data"))).rejects.toThrow(
      /does not belong to group/,
    );
    await expect(storage.exists(OTHER_KEY)).rejects.toThrow(
      /does not belong to group/,
    );
    await expect(storage.delete(OTHER_KEY)).rejects.toThrow(
      /does not belong to group/,
    );
    await expect(storage.list(`${OTHER_GROUP}/ocr`)).rejects.toThrow(
      /does not belong to group/,
    );
    await expect(storage.generateSasUrl(OTHER_KEY, 30)).rejects.toThrow(
      /does not belong to group/,
    );

    for (const fn of Object.values(mockClient)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("refuses keys with a dot segment", async () => {
    const storage = getGroupBlobStorage(GROUP);

    await expect(
      storage.read(`${GROUP}/ocr/../../${OTHER_GROUP}/ocr/doc-1/a.pdf`),
    ).rejects.toThrow(/dot segment/);
    expect(mockClient.read).not.toHaveBeenCalled();
  });
});
