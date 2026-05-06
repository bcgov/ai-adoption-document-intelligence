import { BadRequestException, Injectable } from "@nestjs/common";
import { PDFDocument, PDFImage } from "pdf-lib";
import { AppLoggerService } from "@/logging/app-logger.service";

/** `export =` module — default import breaks under Jest/ts-jest. */
import sharp = require("sharp");

/** Thrown when a valid input could not be converted to PDF (distinct from invalid/corrupt upload). */
export class PdfNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfNormalizationError";
  }
}

const SUPPORTED_SHARP_FORMATS = new Set([
  "jpeg",
  "jpg",
  "png",
  "webp",
  "gif",
  "tiff",
  "tif",
  "bmp",
]);

@Injectable()
export class PdfNormalizationService {
  constructor(private readonly logger: AppLoggerService) {}

  /**
   * Validates upload bytes before persisting the original blob.
   * @throws BadRequestException for corrupt or unsupported inputs.
   */
  async validateForUpload(fileBuffer: Buffer, fileType: string): Promise<void> {
    const ft = fileType.toLowerCase();
    if (ft === "pdf" || ft === "scan") {
      const sig = fileBuffer
        .subarray(0, Math.min(4, fileBuffer.length))
        .toString("latin1");
      if (sig !== "%PDF") {
        throw new BadRequestException(
          "The file is not a valid PDF or is corrupted.",
        );
      }
      try {
        await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
      } catch {
        throw new BadRequestException(
          "The file is not a valid PDF or is corrupted.",
        );
      }
      return;
    }
    if (ft === "image") {
      try {
        const meta = await sharp(fileBuffer).metadata();
        const fmt = meta.format ?? "";
        if (!SUPPORTED_SHARP_FORMATS.has(fmt)) {
          throw new BadRequestException(
            "The image format is not supported. Use JPEG, PNG, TIFF, WebP, GIF, or BMP.",
          );
        }
      } catch (e) {
        if (e instanceof BadRequestException) {
          throw e;
        }
        this.logger.debug("Image validation failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        throw new BadRequestException(
          "The file is not a valid image or is corrupted.",
        );
      }
    }
  }

  /**
   * Produces a PDF buffer suitable for OCR and in-app viewing.
   * @throws PdfNormalizationError when conversion fails after validation.
   */
  async normalizeToPdf(fileBuffer: Buffer, fileType: string): Promise<Buffer> {
    const ft = fileType.toLowerCase();
    if (ft === "pdf" || ft === "scan") {
      return Buffer.from(fileBuffer);
    }
    if (ft === "image") {
      return await this.imageBufferToPdf(fileBuffer);
    }
    throw new PdfNormalizationError(`Unsupported file type: ${fileType}`);
  }

  private async imageBufferToPdf(buffer: Buffer): Promise<Buffer> {
    try {
      const meta = await sharp(buffer).metadata();
      const pageCount = meta.pages ?? 1;
      const isJpeg = meta.format === "jpeg";
      const hasAlpha = meta.hasAlpha ?? false;
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < pageCount; i++) {
        const pipeline =
          pageCount > 1 ? sharp(buffer, { page: i }) : sharp(buffer);

        let embedded: PDFImage;
        if (isJpeg && pageCount === 1) {
          // Embed original JPEG bytes directly — no re-encoding, no quality loss
          embedded = await pdfDoc.embedJpg(buffer);
        } else if (hasAlpha) {
          // PNG is required to preserve transparency
          const pngBuffer = await pipeline.png().toBuffer();
          embedded = await pdfDoc.embedPng(pngBuffer);
        } else {
          // JPEG is far more compact than PNG for non-transparent images
          const jpegBuffer = await pipeline.jpeg({ quality: 100 }).toBuffer();
          embedded = await pdfDoc.embedJpg(jpegBuffer);
        }

        const w = embedded.width;
        const h = embedded.height;
        const page = pdfDoc.addPage([w, h]);
        page.drawImage(embedded, {
          x: 0,
          y: 0,
          width: w,
          height: h,
        });
      }

      return Buffer.from(await pdfDoc.save());
    } catch (e) {
      if (e instanceof PdfNormalizationError) {
        throw e;
      }
      this.logger.warn("PDF normalization from image failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      throw new PdfNormalizationError(
        "Document could not be converted to PDF.",
      );
    }
  }
}
