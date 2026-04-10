import { extname } from "node:path";

const mimeByExt: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
};

/**
 * Derives Content-Type for the original upload from `original_filename` extension.
 */
export function getContentTypeFromFilename(filename: string): string {
  const ext = extname(filename).replace(/^\./, "").toLowerCase();
  return mimeByExt[ext] ?? "application/octet-stream";
}
