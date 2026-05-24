/**
 * SourceUploadService unit tests (US-114)
 *
 * Covers the MIME glob matcher and the size-limit / blob-storage
 * interaction. Mocks BLOB_STORAGE so the tests never touch real
 * MinIO / Azure.
 */

import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  BLOB_STORAGE,
  type BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  mimeMatches,
  type SourceUploadParameters,
  SourceUploadService,
  type UploadedFileLike,
} from "./source-upload.service";

describe("mimeMatches", () => {
  it("exact-matches a specific MIME", () => {
    expect(mimeMatches("application/pdf", ["application/pdf"])).toBe(true);
    expect(mimeMatches("application/json", ["application/pdf"])).toBe(false);
  });

  it("prefix-matches a `type/*` glob", () => {
    expect(mimeMatches("image/png", ["image/*"])).toBe(true);
    expect(mimeMatches("image/jpeg", ["image/*"])).toBe(true);
    expect(mimeMatches("text/plain", ["image/*"])).toBe(false);
  });

  it("matches anything when the bare `*` wildcard is present", () => {
    expect(mimeMatches("application/octet-stream", ["*"])).toBe(true);
  });

  it("returns true if ANY entry in the allowlist matches", () => {
    expect(mimeMatches("image/png", ["application/pdf", "image/*"])).toBe(true);
  });

  it("returns false on an empty allowlist", () => {
    expect(mimeMatches("application/pdf", [])).toBe(false);
  });
});

describe("SourceUploadService", () => {
  let service: SourceUploadService;
  let blobStorage: jest.Mocked<BlobStorageInterface>;

  const baseParameters: SourceUploadParameters = {
    allowedMimeTypes: ["application/pdf"],
    maxFileSizeMB: 5,
    ctxKey: "documentUrl",
  };

  const baseFile = (
    overrides: Partial<UploadedFileLike> = {},
  ): UploadedFileLike => ({
    originalname: "doc.pdf",
    mimetype: "application/pdf",
    size: 1024,
    buffer: Buffer.from("payload"),
    ...overrides,
  });

  beforeEach(async () => {
    blobStorage = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
      deleteByPrefix: jest.fn(),
    } as unknown as jest.Mocked<BlobStorageInterface>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceUploadService,
        { provide: BLOB_STORAGE, useValue: blobStorage },
      ],
    }).compile();

    service = module.get<SourceUploadService>(SourceUploadService);
  });

  it("writes the file to blob storage under the per-group OCR namespace and returns the blob key", async () => {
    // groupId must be a valid CUID per buildBlobFilePath's validator
    // (lowercase alphanumeric, starts with a letter).
    const blobKey = await service.uploadFileForSource(
      baseFile(),
      baseParameters,
      "grouponecuid",
      "wflineagecuid",
      "uploadnode",
    );

    expect(blobStorage.write).toHaveBeenCalledTimes(1);
    const [writtenKey, writtenBuffer] = blobStorage.write.mock.calls[0];
    expect(writtenKey).toBe(blobKey);
    // Path namespace: {groupId}/ocr/workflow-uploads/{workflowId}/{sourceNodeId}/...
    expect(blobKey).toMatch(
      /^grouponecuid\/ocr\/workflow-uploads\/wflineagecuid\/uploadnode\/[^/]+-doc\.pdf$/,
    );
    expect(writtenBuffer).toEqual(Buffer.from("payload"));
  });

  it("rejects a MIME outside the allowlist with BadRequestException", async () => {
    await expect(
      service.uploadFileForSource(
        baseFile({ mimetype: "image/png" }),
        baseParameters,
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(blobStorage.write).not.toHaveBeenCalled();
  });

  it("accepts a MIME matching an `image/*` glob entry", async () => {
    await expect(
      service.uploadFileForSource(
        baseFile({ mimetype: "image/jpeg", originalname: "pic.jpg" }),
        { ...baseParameters, allowedMimeTypes: ["application/pdf", "image/*"] },
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).resolves.toMatch(/-pic\.jpg$/);
    expect(blobStorage.write).toHaveBeenCalledTimes(1);
  });

  it("rejects a file larger than maxFileSizeMB with PayloadTooLargeException (413)", async () => {
    await expect(
      service.uploadFileForSource(
        baseFile({
          originalname: "huge.pdf",
          size: 10 * 1024 * 1024, // 10MB > 5MB limit
        }),
        baseParameters, // maxFileSizeMB: 5
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).rejects.toThrow(PayloadTooLargeException);
    expect(blobStorage.write).not.toHaveBeenCalled();
  });

  it("accepts a file at exactly the size limit", async () => {
    await expect(
      service.uploadFileForSource(
        baseFile({ size: 5 * 1024 * 1024 }),
        baseParameters, // maxFileSizeMB: 5
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).resolves.toBeDefined();
    expect(blobStorage.write).toHaveBeenCalledTimes(1);
  });

  it("does NOT call blob storage when validation fails", async () => {
    // MIME mismatch
    await expect(
      service.uploadFileForSource(
        baseFile({ mimetype: "text/csv" }),
        baseParameters,
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).rejects.toThrow(BadRequestException);

    // Oversize
    await expect(
      service.uploadFileForSource(
        baseFile({ size: 1024 * 1024 * 1024 }),
        baseParameters,
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).rejects.toThrow(PayloadTooLargeException);

    expect(blobStorage.write).not.toHaveBeenCalled();
  });
});
