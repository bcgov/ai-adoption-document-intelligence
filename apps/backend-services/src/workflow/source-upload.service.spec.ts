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
  sanitiseUploadFilename,
  sniffMimeType,
  type UploadedFileLike,
} from "./source-upload.service";

/** Minimal valid magic-byte prefix for a PDF, padded so length >= 4. */
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
/** Minimal valid PNG signature. */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    buffer: PDF_BYTES,
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

  it("writes the file to blob storage under the per-group workflow namespace and returns the blob key", async () => {
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
    // Path namespace: {groupId}/workflow/workflow-uploads/{workflowId}/{sourceNodeId}/...
    expect(blobKey).toMatch(
      /^grouponecuid\/workflow\/workflow-uploads\/wflineagecuid\/uploadnode\/[^/]+-doc\.pdf$/,
    );
    expect(writtenBuffer).toEqual(PDF_BYTES);
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
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await expect(
      service.uploadFileForSource(
        baseFile({
          mimetype: "image/jpeg",
          originalname: "pic.jpg",
          buffer: jpegBytes,
        }),
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

  // -------------------------------------------------------------------
  // Item 8 (path traversal): a `../`-laden originalname must not escape
  // the group-scoped prefix. Sanitisation reduces it to a safe basename
  // and the composed key stays inside `{group}/workflow/...`.
  // -------------------------------------------------------------------
  it("sanitises a traversal-laden originalname so the blob key stays group-scoped", async () => {
    const blobKey = await service.uploadFileForSource(
      baseFile({ originalname: "../../../../etc/passwd" }),
      baseParameters,
      "grouponecuid",
      "wflineagecuid",
      "uploadnode",
    );

    // No `..` segments and no escape from the group/workflow prefix.
    expect(blobKey).toMatch(
      /^grouponecuid\/workflow\/workflow-uploads\/wflineagecuid\/uploadnode\/[^/]+$/,
    );
    expect(blobKey).not.toContain("..");
    expect(blobKey).not.toContain("/etc/");
    // The surviving basename is just `passwd` (directory components stripped).
    expect(blobKey).toMatch(/-passwd$/);
    expect(blobStorage.write).toHaveBeenCalledTimes(1);
    const [writtenKey] = blobStorage.write.mock.calls[0];
    expect(writtenKey).toBe(blobKey);
  });

  it("sanitises a Windows-separator traversal originalname too", async () => {
    const blobKey = await service.uploadFileForSource(
      baseFile({ originalname: "..\\..\\secret.pdf" }),
      baseParameters,
      "grouponecuid",
      "wflineagecuid",
      "uploadnode",
    );
    expect(blobKey).toMatch(
      /^grouponecuid\/workflow\/workflow-uploads\/wflineagecuid\/uploadnode\/[^/]+-secret\.pdf$/,
    );
    expect(blobKey).not.toContain("..");
  });

  it("keeps a normal filename working unchanged (aside from the uuid prefix)", async () => {
    const blobKey = await service.uploadFileForSource(
      baseFile({ originalname: "invoice-2026.pdf" }),
      baseParameters,
      "grouponecuid",
      "wflineagecuid",
      "uploadnode",
    );
    expect(blobKey).toMatch(/-invoice-2026\.pdf$/);
  });

  // -------------------------------------------------------------------
  // Item 11 (content sniffing): a file whose magic bytes contradict its
  // declared (allowed) MIME is rejected; a genuine file passes.
  // -------------------------------------------------------------------
  it("rejects a file whose bytes don't match its declared (allowed) MIME", async () => {
    await expect(
      service.uploadFileForSource(
        // Declares PNG (allowed by glob) but carries PDF magic bytes.
        baseFile({
          mimetype: "image/png",
          originalname: "fake.png",
          buffer: PDF_BYTES,
        }),
        { ...baseParameters, allowedMimeTypes: ["application/pdf", "image/*"] },
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(blobStorage.write).not.toHaveBeenCalled();
  });

  it("accepts a genuine PNG whose bytes match the declared MIME", async () => {
    await expect(
      service.uploadFileForSource(
        baseFile({
          mimetype: "image/png",
          originalname: "real.png",
          buffer: PNG_BYTES,
        }),
        { ...baseParameters, allowedMimeTypes: ["application/pdf", "image/*"] },
        "grouponecuid",
        "wflineagecuid",
        "uploadnode",
      ),
    ).resolves.toMatch(/-real\.png$/);
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

describe("sanitiseUploadFilename", () => {
  it("strips POSIX directory components, keeping the basename", () => {
    expect(sanitiseUploadFilename("../../../etc/passwd")).toBe("passwd");
    expect(sanitiseUploadFilename("a/b/c/file.pdf")).toBe("file.pdf");
  });

  it("strips Windows directory components", () => {
    expect(sanitiseUploadFilename("..\\..\\secret.pdf")).toBe("secret.pdf");
    expect(sanitiseUploadFilename("C:\\Users\\x\\doc.pdf")).toBe("doc.pdf");
  });

  it("collapses bare traversal/dot names to the fallback", () => {
    expect(sanitiseUploadFilename("..")).toBe("upload");
    expect(sanitiseUploadFilename(".")).toBe("upload");
    expect(sanitiseUploadFilename("")).toBe("upload");
    expect(sanitiseUploadFilename("   ")).toBe("upload");
  });

  it("leaves a normal filename intact", () => {
    expect(sanitiseUploadFilename("invoice-2026.pdf")).toBe("invoice-2026.pdf");
  });

  it("removes residual path/illegal characters", () => {
    expect(sanitiseUploadFilename("a:b")).toBe("ab");
  });
});

describe("sniffMimeType", () => {
  it("detects PDF", () => {
    expect(sniffMimeType(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      "application/pdf",
    );
  });

  it("detects PNG", () => {
    expect(
      sniffMimeType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
  });

  it("detects JPEG", () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
  });

  it("detects GIF", () => {
    expect(sniffMimeType(Buffer.from([0x47, 0x49, 0x46, 0x38]))).toBe(
      "image/gif",
    );
  });

  it("detects WEBP", () => {
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffMimeType(webp)).toBe("image/webp");
  });

  it("returns undefined for unrecognised bytes", () => {
    expect(sniffMimeType(Buffer.from("just some text"))).toBeUndefined();
  });

  it("returns undefined for a too-short buffer", () => {
    expect(sniffMimeType(Buffer.from([0x25]))).toBeUndefined();
  });
});
