import type { BlobReadInput } from "./blob-read";
import { blobRead } from "./blob-read";

const mockBlobRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

describe("blobRead activity", () => {
  beforeEach(() => {
    mockBlobRead.mockReset();
  });

  // Scenario 1: returns blob contents as base64
  it("returns the blob contents as a base64 string", async () => {
    const content = Buffer.from("hello world");
    mockBlobRead.mockResolvedValue(content);

    const input: BlobReadInput = {
      blobKey: "atestgroup/ocr/doc-1/segment-001.pdf",
    };

    const result = await blobRead(input);

    expect(result.base64).toBe(content.toString("base64"));
  });

  // Scenario 2: correct key is passed to blob storage
  it("passes the blobKey to the blob storage client", async () => {
    mockBlobRead.mockResolvedValue(Buffer.from("data"));

    const input: BlobReadInput = {
      blobKey: "atestgroup/ocr/doc-1/segment-001.pdf",
    };

    await blobRead(input);

    expect(mockBlobRead).toHaveBeenCalledWith(
      "atestgroup/ocr/doc-1/segment-001.pdf",
    );
  });

  // Scenario 3: propagates blob storage errors
  it("propagates errors from blob storage", async () => {
    mockBlobRead.mockRejectedValue(new Error("blob not found"));

    const input: BlobReadInput = {
      blobKey: "atestgroup/ocr/doc-1/missing.pdf",
    };

    await expect(blobRead(input)).rejects.toThrow("blob not found");
  });

  // Scenario 4: empty blob produces an empty base64 string
  it("returns an empty base64 string for an empty blob", async () => {
    mockBlobRead.mockResolvedValue(Buffer.alloc(0));

    const input: BlobReadInput = {
      blobKey: "atestgroup/ocr/doc-1/empty.pdf",
    };

    const result = await blobRead(input);

    expect(result.base64).toBe("");
  });

  // Scenario 5: binary content round-trips correctly through base64
  it("encodes binary content correctly (round-trip check)", async () => {
    const binaryContent = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
    mockBlobRead.mockResolvedValue(binaryContent);

    const input: BlobReadInput = {
      blobKey: "atestgroup/ocr/doc-1/binary.pdf",
    };

    const result = await blobRead(input);

    expect(Buffer.from(result.base64, "base64")).toEqual(binaryContent);
  });
});
