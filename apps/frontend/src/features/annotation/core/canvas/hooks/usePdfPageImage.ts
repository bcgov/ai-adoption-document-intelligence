import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const RENDER_SCALE = 2;

interface PdfPageImageResult {
  /** Data URL of the rendered page image, or null while loading / on error. */
  imageUrl: string | null;
  /** Natural pixel dimensions of the rendered page at RENDER_SCALE. */
  pageSize: { width: number; height: number } | null;
  /** Total number of pages in the PDF document. */
  numPages: number;
  /** True while the page is being rendered. */
  isRendering: boolean;
}

/**
 * Renders a single PDF page to a data-URL image via pdfjs-dist.
 *
 * Pass `null` for `pdfUrl` to skip rendering (e.g. when URL is not yet available).
 * For non-PDF image URLs, pass `null` and handle the image directly.
 */
export function usePdfPageImage(
  pdfUrl: string | null,
  pageNumber: number,
): PdfPageImageResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  // Load the PDF document when URL changes
  useEffect(() => {
    if (!pdfUrl) {
      pdfDocRef.current = null;
      currentUrlRef.current = null;
      setImageUrl(null);
      setPageSize(null);
      setNumPages(0);
      return;
    }

    let cancelled = false;

    const loadDoc = async () => {
      if (currentUrlRef.current === pdfUrl && pdfDocRef.current) return;
      try {
        const doc = await pdfjsLib.getDocument({
          url: pdfUrl,
          wasmUrl: "/pdfjs-wasm/",
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        currentUrlRef.current = pdfUrl;
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) {
          pdfDocRef.current = null;
          setNumPages(0);
        }
      }
    };

    void loadDoc();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Render the requested page whenever doc or page number changes
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;

    let cancelled = false;
    const doc = pdfDocRef.current;

    const renderPage = async () => {
      const clampedPage = Math.max(1, Math.min(pageNumber, doc.numPages));
      setIsRendering(true);
      try {
        const page = await doc.getPage(clampedPage);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        if (cancelled) return;

        setImageUrl(canvas.toDataURL("image/png"));
        setPageSize({ width: viewport.width, height: viewport.height });
      } catch {
        if (!cancelled) {
          setImageUrl(null);
          setPageSize(null);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [numPages, pageNumber]);

  return { imageUrl, pageSize, numPages, isRendering };
}
