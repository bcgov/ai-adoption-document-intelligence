import { BadRequestException } from "@nestjs/common";
import { degrees, PDFDocument } from "pdf-lib";
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

  describe("normalizeToPdf – PDF rotation baking", () => {
    async function pdfWithRotation(angle: number): Promise<Buffer> {
      const doc = await PDFDocument.create();
      const page = doc.addPage([200, 100]);
      // Draw minimal content so the page has a content stream (required for embedPage)
      page.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
      page.setRotation(degrees(angle));
      return Buffer.from(await doc.save());
    }

    it("returns original buffer unchanged when no page has rotation", async () => {
      const buf = await minimalValidPdfBuffer();
      const out = await service.normalizeToPdf(buf, "pdf");
      // Same bytes expected
      expect(out.equals(buf)).toBe(true);
    });

    it("produces a PDF with Rotate=0 on all pages for 90° rotation", async () => {
      const buf = await pdfWithRotation(90);
      const out = await service.normalizeToPdf(buf, "pdf");
      const parsed = await PDFDocument.load(out);
      expect(parsed.getPageCount()).toBe(1);
      expect(parsed.getPage(0).getRotation().angle).toBe(0);
    });

    it("swaps page dimensions when baking 90° rotation", async () => {
      const buf = await pdfWithRotation(90);
      const out = await service.normalizeToPdf(buf, "pdf");
      const parsed = await PDFDocument.load(out);
      const page = parsed.getPage(0);
      // Native page was 200×100; after 90° CW bake the visual size becomes 100×200.
      expect(page.getWidth()).toBe(100);
      expect(page.getHeight()).toBe(200);
    });

    it("produces Rotate=0 and unchanged dimensions for 180° rotation", async () => {
      const buf = await pdfWithRotation(180);
      const out = await service.normalizeToPdf(buf, "pdf");
      const parsed = await PDFDocument.load(out);
      const page = parsed.getPage(0);
      expect(page.getRotation().angle).toBe(0);
      expect(page.getWidth()).toBe(200);
      expect(page.getHeight()).toBe(100);
    });

    it("produces Rotate=0 and swapped dimensions for 270° rotation", async () => {
      const buf = await pdfWithRotation(270);
      const out = await service.normalizeToPdf(buf, "pdf");
      const parsed = await PDFDocument.load(out);
      const page = parsed.getPage(0);
      expect(page.getRotation().angle).toBe(0);
      expect(page.getWidth()).toBe(100);
      expect(page.getHeight()).toBe(200);
    });

    it("handles mixed-rotation multi-page PDFs", async () => {
      const srcDoc = await PDFDocument.create();
      const p1 = srcDoc.addPage([200, 100]);
      p1.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
      p1.setRotation(degrees(0));
      const p2 = srcDoc.addPage([200, 100]);
      p2.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
      p2.setRotation(degrees(90));
      const p3 = srcDoc.addPage([200, 100]);
      p3.drawRectangle({ x: 0, y: 0, width: 10, height: 10 });
      p3.setRotation(degrees(180));
      const buf = Buffer.from(await srcDoc.save());

      const out = await service.normalizeToPdf(buf, "pdf");
      const parsed = await PDFDocument.load(out);
      expect(parsed.getPageCount()).toBe(3);
      for (let i = 0; i < 3; i++) {
        expect(parsed.getPage(i).getRotation().angle).toBe(0);
      }
    });

    it("also works for scan file type", async () => {
      const buf = await pdfWithRotation(90);
      const out = await service.normalizeToPdf(buf, "scan");
      const parsed = await PDFDocument.load(out);
      expect(parsed.getPage(0).getRotation().angle).toBe(0);
    });
  });
});
