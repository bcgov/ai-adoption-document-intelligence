import { BadRequestException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import {
  PdfNormalizationError,
  PdfNormalizationService,
} from "./pdf-normalization.service";

/** Minimal valid 1×1 PNG (sharp accepts). */
const MIN_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01,
  0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

async function minimalValidPdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  return Buffer.from(await doc.save());
}

describe("PdfNormalizationService", () => {
  let service: PdfNormalizationService;

  beforeEach(() => {
    service = new PdfNormalizationService(mockAppLogger);
  });

  describe("validateForUpload", () => {
    it("rejects PDF when magic bytes are not %PDF", async () => {
      await expect(
        service.validateForUpload(Buffer.from("not a pdf"), "pdf"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects PDF when header is valid but body is truncated", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const full = await minimalValidPdfBuffer();
        const truncated = full.subarray(0, Math.floor(full.length / 2));
        await expect(
          service.validateForUpload(truncated, "pdf"),
        ).rejects.toThrow(BadRequestException);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("accepts a minimal valid PDF", async () => {
      const buf = await minimalValidPdfBuffer();
      await expect(
        service.validateForUpload(buf, "pdf"),
      ).resolves.toBeUndefined();
    });

    it("accepts the same for scan file type", async () => {
      const buf = await minimalValidPdfBuffer();
      await expect(
        service.validateForUpload(buf, "scan"),
      ).resolves.toBeUndefined();
    });

    it("rejects corrupt image buffer", async () => {
      await expect(
        service.validateForUpload(Buffer.from("not an image"), "image"),
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts a minimal PNG as image", async () => {
      await expect(
        service.validateForUpload(MIN_PNG, "image"),
      ).resolves.toBeUndefined();
    });
  });

  describe("normalizeToPdf", () => {
    it("returns a copy of the buffer for pdf", async () => {
      const buf = await minimalValidPdfBuffer();
      const out = await service.normalizeToPdf(buf, "pdf");
      expect(out.equals(buf)).toBe(true);
    });

    it("returns a copy for scan", async () => {
      const buf = await minimalValidPdfBuffer();
      const out = await service.normalizeToPdf(buf, "scan");
      expect(out.equals(buf)).toBe(true);
    });

    it("embeds a PNG image as PDF pages", async () => {
      const out = await service.normalizeToPdf(MIN_PNG, "image");
      expect(out.length).toBeGreaterThan(100);
      const parsed = await PDFDocument.load(out);
      expect(parsed.getPageCount()).toBe(1);
    });

    it("throws PdfNormalizationError for unsupported file type", async () => {
      await expect(
        service.normalizeToPdf(Buffer.from("x"), "unknown"),
      ).rejects.toThrow(PdfNormalizationError);
    });
  });
});
