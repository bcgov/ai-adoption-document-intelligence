/**
 * Unit tests for `PreviewBlobExcerptService` (G-022).
 *
 * The endpoint must resolve a blob-backed `OcrResult` pointer into a bounded
 * excerpt, report what it left out, degrade honestly when the payload is gone,
 * and not touch anything that is not blob-backed.
 */

import { Test, type TestingModule } from "@nestjs/testing";

import { BLOB_STORAGE } from "@/blob-storage/blob-storage.interface";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  MAX_EXCERPT_BLOB_BYTES,
  MAX_EXCERPT_BLOBS_PER_REQUEST,
} from "./preview-blob-excerpt";
import {
  BlobExcerptBudget,
  collectBlobPointers,
  isBlobBackedValue,
  PreviewBlobExcerptService,
} from "./preview-blob-excerpt.service";

// Blob paths must start with a CUID-shaped group id (`validateBlobFilePath`).
const GROUP = "grpaaa111";
const BLOB_PATH = `${GROUP}/ocr/doc1/ocr-result.json`;

function pointer(overrides: Record<string, unknown> = {}) {
  return {
    documentId: "doc-1",
    blobPath: BLOB_PATH,
    storage: "blob",
    status: "succeeded",
    ...overrides,
  };
}

describe("PreviewBlobExcerptService", () => {
  let service: PreviewBlobExcerptService;
  let blobStorage: { read: jest.Mock };

  beforeEach(async () => {
    blobStorage = { read: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreviewBlobExcerptService,
        { provide: BLOB_STORAGE, useValue: blobStorage },
        {
          provide: AppLoggerService,
          useValue: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PreviewBlobExcerptService);
  });

  describe("pointer detection", () => {
    it("recognises a blob-backed OcrResult value", () => {
      expect(isBlobBackedValue(pointer())).toBe(true);
    });

    it("does not treat an ordinary object as blob-backed", () => {
      expect(isBlobBackedValue({ blobKey: "b1", pageCount: 3 })).toBe(false);
      expect(isBlobBackedValue({ label: "invoice", confidence: 0.9 })).toBe(
        false,
      );
      expect(isBlobBackedValue("blob://x")).toBe(false);
    });

    it("finds pointers nested inside the outputCtx delta", () => {
      const found = collectBlobPointers({
        __auto: { extract: { ocrResult: pointer() } },
        unrelated: { a: 1 },
      });
      expect([...found.keys()]).toEqual([BLOB_PATH]);
    });

    it("de-duplicates the same blob referenced twice", () => {
      const found = collectBlobPointers({ a: pointer(), b: pointer() });
      expect(found.size).toBe(1);
    });
  });

  describe("resolveOutputCtx", () => {
    it("resolves a blob-backed OcrResult into a bounded excerpt", async () => {
      blobStorage.read.mockResolvedValue(
        Buffer.from(
          JSON.stringify({
            fileName: "a.pdf",
            documents: [
              { fields: { applicantName: { content: "A. Person" } } },
            ],
          }),
        ),
      );

      const result = await service.resolveOutputCtx(
        { ocrResult: pointer() },
        GROUP,
        new BlobExcerptBudget(),
      );

      expect(result).toBeDefined();
      const excerpt = result?.[BLOB_PATH];
      expect(excerpt?.status).toBe("resolved");
      // The whole point: extracted VALUES, not the pointer.
      expect(JSON.stringify(excerpt?.excerpt)).toContain("A. Person");
      expect(blobStorage.read).toHaveBeenCalledWith(BLOB_PATH);
    });

    it("reports the excerpt's limits so the client can say what was omitted", async () => {
      blobStorage.read.mockResolvedValue(
        Buffer.from(
          JSON.stringify({ pages: Array.from({ length: 300 }, (_, i) => i) }),
        ),
      );

      const result = await service.resolveOutputCtx(
        { ocrResult: pointer() },
        GROUP,
        new BlobExcerptBudget(),
      );
      const excerpt = result?.[BLOB_PATH];

      expect(excerpt?.truncated).toBe(true);
      expect(excerpt?.omissions).toContain(
        "pages: showing the first 5 of 300 items",
      );
      expect(excerpt?.limits.maxArrayItems).toBe(5);
      expect(excerpt?.limits.maxTotalChars).toBeGreaterThan(0);
      expect(excerpt?.byteLength).toBeGreaterThan(0);
    });

    it("degrades gracefully when the blob is gone", async () => {
      blobStorage.read.mockRejectedValue(new Error("NoSuchKey"));

      const result = await service.resolveOutputCtx(
        { ocrResult: pointer() },
        GROUP,
        new BlobExcerptBudget(),
      );
      const excerpt = result?.[BLOB_PATH];

      expect(excerpt?.status).toBe("unavailable");
      expect(excerpt?.reason).toBe("not-found");
      expect(excerpt?.excerpt).toBeUndefined();
    });

    it("reports unreadable rather than throwing when the payload is not JSON", async () => {
      blobStorage.read.mockResolvedValue(Buffer.from("<html>nope</html>"));

      const result = await service.resolveOutputCtx(
        { ocrResult: pointer() },
        GROUP,
        new BlobExcerptBudget(),
      );

      expect(result?.[BLOB_PATH].reason).toBe("unreadable");
    });

    it("does not dereference for kinds that are not blob-backed", async () => {
      const result = await service.resolveOutputCtx(
        {
          document: { blobKey: "b1", pageCount: 3 },
          classification: { label: "invoice", confidence: 0.92 },
        },
        GROUP,
        new BlobExcerptBudget(),
      );

      expect(result).toBeUndefined();
      expect(blobStorage.read).not.toHaveBeenCalled();
    });

    it("refuses a pointer addressing another group's blobs", async () => {
      const result = await service.resolveOutputCtx(
        {
          ocrResult: pointer({
            blobPath: "grpbbb222/ocr/doc9/ocr-result.json",
          }),
        },
        GROUP,
        new BlobExcerptBudget(),
      );

      expect(result?.["grpbbb222/ocr/doc9/ocr-result.json"].reason).toBe(
        "outside-group",
      );
      expect(blobStorage.read).not.toHaveBeenCalled();
    });

    it("refuses a payload declared larger than the byte ceiling without reading it", async () => {
      const result = await service.resolveOutputCtx(
        { ocrResult: pointer({ byteLength: MAX_EXCERPT_BLOB_BYTES + 1 }) },
        GROUP,
        new BlobExcerptBudget(),
      );

      expect(result?.[BLOB_PATH].reason).toBe("too-large");
      expect(result?.[BLOB_PATH].byteLength).toBe(MAX_EXCERPT_BLOB_BYTES + 1);
      expect(blobStorage.read).not.toHaveBeenCalled();
    });

    it("caps the number of blobs dereferenced per request and says so", async () => {
      blobStorage.read.mockResolvedValue(Buffer.from(JSON.stringify({ a: 1 })));
      const budget = new BlobExcerptBudget();

      const overCap = MAX_EXCERPT_BLOBS_PER_REQUEST + 3;
      const ctx: Record<string, unknown> = {};
      for (let i = 0; i < overCap; i++) {
        ctx[`n${i}`] = pointer({
          blobPath: `${GROUP}/ocr/doc${i}/ocr-result.json`,
        });
      }

      const result = await service.resolveOutputCtx(ctx, GROUP, budget);
      const values = Object.values(result ?? {});

      expect(values.filter((v) => v.status === "resolved")).toHaveLength(
        MAX_EXCERPT_BLOBS_PER_REQUEST,
      );
      const skipped = values.filter((v) => v.reason === "request-limit");
      expect(skipped).toHaveLength(3);
      // Skipped pointers are REPORTED, never silently dropped from the map.
      expect(values).toHaveLength(overCap);
    });

    it("shares one budget across rows, as the batch endpoint does", async () => {
      blobStorage.read.mockResolvedValue(Buffer.from(JSON.stringify({ a: 1 })));
      const budget = new BlobExcerptBudget(1);

      const first = await service.resolveOutputCtx(
        { ocrResult: pointer() },
        GROUP,
        budget,
      );
      const second = await service.resolveOutputCtx(
        { ocrResult: pointer({ blobPath: `${GROUP}/ocr/doc2/r.json` }) },
        GROUP,
        budget,
      );

      expect(first?.[BLOB_PATH].status).toBe("resolved");
      expect(second?.[`${GROUP}/ocr/doc2/r.json`].reason).toBe("request-limit");
    });
  });
});
