import { BadRequestException, Injectable } from "@nestjs/common";
import { degrees, PDFDocument, PDFImage } from "pdf-lib";
import { AppLoggerService } from "@/logging/app-logger.service";
import { loadMupdf } from "./esm-imports";

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
   * Generates a WebP thumbnail (~200 px wide) from the document's first page.
   *
   * For image uploads, sharp processes the original buffer directly.
   * For PDF/scan uploads, mupdf rasterises page 0 at 72 dpi and sharp
   * converts the resulting PNG to WebP.
   *
   * @param fileBuffer - Original file buffer (image bytes or PDF bytes).
   * @param fileType - "image", "pdf", or "scan".
   * @returns WebP thumbnail buffer.
   * @throws PdfNormalizationError if thumbnail generation fails.
   */
  async generateThumbnailWebp(
    fileBuffer: Buffer,
    fileType: string,
  ): Promise<Buffer> {
    const ft = fileType.toLowerCase();
    try {
      if (ft === "image") {
        return await sharp(fileBuffer)
          .resize({ width: 200, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer();
      }

      if (ft === "pdf" || ft === "scan") {
        const mupdf = await loadMupdf();
        const doc = mupdf.Document.openDocument(
          new Uint8Array(fileBuffer),
          "application/pdf",
        );
        const page = doc.loadPage(0);
        const matrix = mupdf.Matrix.scale(1, 1);
        const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB);
        const pngBuffer = Buffer.from(pixmap.asPNG());
        return await sharp(pngBuffer)
          .resize({ width: 200, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer();
      }

      throw new PdfNormalizationError(
        `Cannot generate thumbnail for file type: ${fileType}`,
      );
    } catch (e) {
      if (e instanceof PdfNormalizationError) {
        throw e;
      }
      this.logger.warn("Thumbnail generation failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      throw new PdfNormalizationError("Thumbnail could not be generated.");
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

  /**
   * Embeds an image (or each page of a multi-page raster) into a PDF.
   *
   * Encoding policy:
   *  - Single-page JPEG with no EXIF orientation transform → embedded verbatim.
   *  - Everything else (PNG, TIFF, WebP, GIF, BMP, multi-page, oriented JPEG)
   *    → re-encoded to JPEG q=85 after applying EXIF rotation and flattening
   *    any alpha onto white.
   *
   * pdf-lib's `embedPng` is intentionally avoided: it decodes PNG to raw RGB
   * and stores it as FlateDecode WITHOUT PNG predictors (see
   * `node_modules/pdf-lib/es/core/embedders/PngEmbedder.js`), producing PDFs
   * 3–10× larger than the source PNG. Re-encoding to JPEG produces materially
   * smaller PDFs without measurable quality loss for the document use case.
   */
  private async imageBufferToPdf(buffer: Buffer): Promise<Buffer> {
    try {
      const meta = await sharp(buffer).metadata();
      const pageCount = meta.pages ?? 1;
      const isJpeg = meta.format === "jpeg";
      // EXIF Orientation tag: 1 = no rotation. Absent tag is treated the same.
      // Values 2–8 encode rotations and/or mirrors that must be baked into the
      // pixels before embedding because PDF's image XObject does not honour EXIF.
      const orientation = meta.orientation ?? 1;
      const pdfDoc = await PDFDocument.create();

      for (let i = 0; i < pageCount; i++) {
        let embedded: PDFImage;
        if (isJpeg && pageCount === 1 && orientation === 1) {
          // Fast path: bytes verbatim. Content-based detection for sideways
          // pixels with no EXIF metadata happens later in the OSD activity,
          // not in this metadata-driven layer.
          embedded = await pdfDoc.embedJpg(buffer);
        } else {
          const pipeline =
            pageCount > 1 ? sharp(buffer, { page: i }) : sharp(buffer);
          // .rotate() (no-arg) bakes the EXIF Orientation tag into pixels.
          // .flatten() composites any alpha onto white — JPEG can't carry
          // transparency, and white is the conventional background for
          // documents. flatten() is a no-op when no alpha channel exists.
          const jpegBuffer = await pipeline
            .rotate()
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 85 })
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
   *
   * The same per-page rotation-baking transform (the switch on 90 / 180 / 270
   * below) is also implemented in
   * `apps/temporal/src/activities/normalize-document-orientation.ts`, where the
   * angle source is Tesseract OSD detection rather than the PDF /Rotate flag.
   * Keep both sites in sync when changing the math.
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
