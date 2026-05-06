import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { degrees, PDFDocument } from "pdf-lib";
import type { Worker as TesseractWorker } from "tesseract.js";
import { OEM } from "tesseract.js";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import { createActivityLogger } from "../logger";
import { loadMupdf, loadTesseract } from "./esm-imports";

const DEFAULT_CONFIDENCE_THRESHOLD = 2.0;

/**
 * Per-page orientation detection and correction result.
 */
export interface PageOrientationResult {
  /** 1-based page number. */
  pageNumber: number;
  /** Clockwise degrees detected by Tesseract OSD (0 | 90 | 180 | 270). */
  detectedAngle: number;
  /** Tesseract OSD confidence score. */
  confidence: number;
  /** Whether a correction was applied to this page. */
  corrected: boolean;
}

export interface NormalizeDocumentOrientationInput {
  /** Blob key of the normalized PDF to inspect and correct. */
  blobKey: string;
  /**
   * Minimum Tesseract OSD confidence required before applying a correction.
   * Defaults to 2.0. Lower values correct more aggressively; higher values
   * reduce false-positive rotations on sparse or decorative pages.
   */
  confidenceThreshold?: number;
}

export interface NormalizeDocumentOrientationOutput {
  /** Blob key where the (possibly corrected) PDF was written. Same as input when no corrections needed. */
  correctedBlobKey: string;
  /** Per-page detection and correction details. */
  pageCorrections: PageOrientationResult[];
}

/**
 * Lazily imported mupdf module (ESM-only package, loaded via dynamic import).
 * Cached after first load so subsequent activity invocations in the same
 * worker process skip the WASM initialisation overhead.
 */
let mupdfPromise: Promise<typeof import("mupdf")["default"]> | null = null;

/**
 * Returns the mupdf default export, loading it via `loadMupdf()` on first call
 * and caching the result for the lifetime of the worker process.
 *
 * @returns The default export of the mupdf module.
 */
async function getMupdf(): Promise<typeof import("mupdf")["default"]> {
  if (!mupdfPromise) {
    mupdfPromise = loadMupdf();
  }
  return mupdfPromise;
}

/**
 * Renders a single PDF page to a PNG buffer using mupdf at 72 dpi (1× scale).
 * 72 dpi is sufficient for Tesseract OSD — it does not need high resolution.
 *
 * @param mupdf - The loaded mupdf module.
 * @param pdfBuffer - Raw PDF bytes.
 * @param pageIndex - 0-based page index.
 * @returns PNG bytes suitable for Tesseract.
 */
function renderPageToPng(
  mupdf: Awaited<ReturnType<typeof getMupdf>>,
  pdfBuffer: Buffer,
  pageIndex: number,
): Buffer {
  const doc = mupdf.Document.openDocument(
    new Uint8Array(pdfBuffer),
    "application/pdf",
  );
  const page = doc.loadPage(pageIndex);
  const matrix = mupdf.Matrix.scale(1, 1);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB);
  return Buffer.from(pixmap.asPNG());
}

/**
 * Detects the orientation of each PDF page independently using Tesseract OSD,
 * then bakes any corrections directly into the content stream (no /Rotate flag).
 *
 * For each page the activity:
 *  1. Renders the page to a PNG via mupdf (no system binaries required).
 *  2. Runs Tesseract OSD (TESSERACT_ONLY engine) to obtain the orientation angle.
 *  3. If the detected angle is non-zero and confidence meets the threshold,
 *     embeds the source page as an XObject and redraws it with the correction
 *     transform so the stored PDF is correctly oriented for any viewer.
 *
 * Pages with zero orientation or low confidence are copied unchanged.
 * If no pages require correction the input blob is returned as-is (no write).
 *
 * @param input - Blob key of the normalized PDF and optional confidence threshold.
 * @returns Corrected blob key and per-page correction details.
 */
export async function normalizeDocumentOrientation(
  input: NormalizeDocumentOrientationInput,
): Promise<NormalizeDocumentOrientationOutput> {
  const activityName = "normalizeDocumentOrientation";
  const { blobKey, confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD } = input;
  const log = createActivityLogger(activityName, { blobKey });

  log.info("normalizeDocumentOrientation start", { event: "start", blobKey });

  const blobStorage = getBlobStorageClient();
  const pdfBuffer = await blobStorage.read(validateBlobFilePath(blobKey));

  const mupdf = await getMupdf();

  // Count pages via mupdf (avoids loading pdf-lib just for page count).
  const mupdfDoc = mupdf.Document.openDocument(
    new Uint8Array(pdfBuffer),
    "application/pdf",
  );
  const pageCount = mupdfDoc.countPages();

  // Load tesseract OSD worker once for all pages in this document.
  const { createWorker } = await loadTesseract();
  const worker: TesseractWorker = await createWorker("osd", OEM.TESSERACT_ONLY);

  const pageCorrections: PageOrientationResult[] = [];

  try {
    for (let i = 0; i < pageCount; i++) {
      let detectedAngle = 0;
      let confidence = 0;

      try {
        const pagePng = renderPageToPng(mupdf, pdfBuffer, i);
        const result = await worker.detect(pagePng);
        detectedAngle = result.data.orientation_degrees ?? 0;
        confidence = result.data.orientation_confidence ?? 0;
      } catch (osdError) {
        log.warn(`OSD failed for page ${i + 1}, skipping`, {
          event: "osd_failed",
          page: i + 1,
          error: getErrorMessage(osdError),
          stack: getErrorStack(osdError),
        });
      }

      const corrected =
        detectedAngle !== 0 && confidence >= confidenceThreshold;

      pageCorrections.push({
        pageNumber: i + 1,
        detectedAngle,
        confidence,
        corrected,
      });
    }
  } finally {
    await worker.terminate();
  }

  const anyCorrections = pageCorrections.some((p) => p.corrected);

  if (!anyCorrections) {
    log.info("normalizeDocumentOrientation complete - no corrections needed", {
      event: "complete_no_corrections",
      pageCount,
    });
    return { correctedBlobKey: blobKey, pageCorrections };
  }

  // Build a corrected PDF, processing each page independently.
  try {
    const srcDoc = await PDFDocument.load(new Uint8Array(pdfBuffer));
    const newDoc = await PDFDocument.create();

    for (let i = 0; i < pageCount; i++) {
      const correction = pageCorrections[i];

      if (!correction.corrected) {
        const [copied] = await newDoc.copyPages(srcDoc, [i]);
        newDoc.addPage(copied);
        continue;
      }

      const srcPage = srcDoc.getPage(i);
      const embedded = await newDoc.embedPage(srcPage);
      const nativeW = embedded.width;
      const nativeH = embedded.height;

      // Clockwise correction angle returned by Tesseract OSD.
      const angle = correction.detectedAngle; // 90 | 180 | 270

      // After applying a 90° or 270° CW rotation the visual dimensions swap.
      const swapDims = angle === 90 || angle === 270;
      const pageW = swapDims ? nativeH : nativeW;
      const pageH = swapDims ? nativeW : nativeH;

      // pdf-lib uses CCW-positive angles. Compute draw origin and CCW rotation
      // that bakes the CW correction into the content stream.
      let drawX: number;
      let drawY: number;
      let drawRotate: ReturnType<typeof degrees>;

      switch (angle) {
        case 90:
          // CW 90° → CCW -90°; translate up by native width
          drawX = 0;
          drawY = nativeW;
          drawRotate = degrees(-90);
          break;
        case 180:
          // CW 180° → CCW 180°; translate to top-right
          drawX = nativeW;
          drawY = nativeH;
          drawRotate = degrees(180);
          break;
        case 270:
          // CW 270° → CCW 90°; translate right by native height
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

    const correctedBuffer = Buffer.from(await newDoc.save());
    await blobStorage.write(
      validateBlobFilePath(blobKey),
      correctedBuffer as unknown as Buffer,
    );

    const correctedCount = pageCorrections.filter((p) => p.corrected).length;
    log.info("normalizeDocumentOrientation complete", {
      event: "complete",
      pageCount,
      correctedPages: correctedCount,
    });

    return { correctedBlobKey: blobKey, pageCorrections };
  } catch (error) {
    log.error("normalizeDocumentOrientation failed during PDF correction", {
      event: "correction_failed",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
