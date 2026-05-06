import { BadRequestException, Injectable } from "@nestjs/common";
import { degrees, PDFDocument, PDFImage } from "pdf-lib";
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
   * For PDFs, bakes any /Rotate page flags into content so all pages have Rotate=0.
   * For images, applies EXIF orientation before embedding so the stored PDF is correctly oriented.
   * @throws PdfNormalizationError when conversion fails after validation.
   */
  async normalizeToPdf(fileBuffer: Buffer, fileType: string): Promise<Buffer> {
    const ft = fileType.toLowerCase();
    if (ft === "pdf" || ft === "scan") {
      return await this.normalizePdfPageRotations(fileBuffer);
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
      const hasAlpha = meta.hasAlpha ?? false;
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < pageCount; i++) {
        const pipeline =
          pageCount > 1 ? sharp(buffer, { page: i }) : sharp(buffer);

        // .rotate() with no arguments auto-orients the image from its EXIF orientation tag.
        let embedded: PDFImage;
        if (hasAlpha) {
          // PNG is required to preserve transparency
          const pngBuffer = await pipeline.rotate().png().toBuffer();
          embedded = await pdfDoc.embedPng(pngBuffer);
        } else {
          // JPEG is far more compact than PNG for non-transparent images
          const jpegBuffer = await pipeline
            .rotate()
            .jpeg({ quality: 100 })
            .toBuffer();
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

  /**
   * Loads the PDF, and for any page whose /Rotate flag is non-zero, bakes the
   * rotation into the page content and resets the flag to 0.  Pages that are
   * already upright are copied without re-encoding.
   *
   * This ensures the stored normalized PDF renders correctly in any viewer or
   * programmatic tool regardless of whether it honours the /Rotate metadata.
   */
  private async normalizePdfPageRotations(fileBuffer: Buffer): Promise<Buffer> {
    const srcDoc = await PDFDocument.load(fileBuffer);
    const pageCount = srcDoc.getPageCount();

    const hasRotation = srcDoc
      .getPages()
      .some((p) => p.getRotation().angle !== 0);
    if (!hasRotation) {
      return Buffer.from(fileBuffer);
    }

    const newDoc = await PDFDocument.create();

    for (let i = 0; i < pageCount; i++) {
      const srcPage = srcDoc.getPage(i);
      const rotationAngle = srcPage.getRotation().angle; // 0 | 90 | 180 | 270

      if (rotationAngle === 0) {
        const [copied] = await newDoc.copyPages(srcDoc, [i]);
        newDoc.addPage(copied);
        continue;
      }

      // Embed the source page as an XObject so we can draw it with a transform.
      // embedded.width/height are the page's *native* (pre-rotation) dimensions.
      const embedded = await newDoc.embedPage(srcPage);
      const nativeW = embedded.width;
      const nativeH = embedded.height;

      // Visual dimensions after applying the /Rotate flag.
      const swapDims = rotationAngle === 90 || rotationAngle === 270;
      const pageW = swapDims ? nativeH : nativeW;
      const pageH = swapDims ? nativeW : nativeH;

      // Compute draw origin and angle that bakes the rotation into content.
      // PDF coordinates are bottom-left origin; pdf-lib rotate is counter-clockwise.
      let drawX: number;
      let drawY: number;
      let drawRotate: ReturnType<typeof degrees>;

      switch (rotationAngle) {
        case 90:
          // CW 90°: rotate CCW 90° and translate up by native width.
          drawX = 0;
          drawY = nativeW;
          drawRotate = degrees(-90);
          break;
        case 180:
          // 180°: translate to top-right corner.
          drawX = nativeW;
          drawY = nativeH;
          drawRotate = degrees(180);
          break;
        case 270:
          // CW 270° (CCW 90°): rotate CCW 270° and translate right by native height.
          drawX = nativeH;
          drawY = 0;
          drawRotate = degrees(90);
          break;
        default:
          drawX = 0;
          drawY = 0;
          drawRotate = degrees(0);
      }

      const newPage = newDoc.addPage([pageW, pageH]);
      newPage.drawPage(embedded, {
        x: drawX,
        y: drawY,
        width: nativeW,
        height: nativeH,
        rotate: drawRotate,
      });
    }

    return Buffer.from(await newDoc.save());
  }
}
