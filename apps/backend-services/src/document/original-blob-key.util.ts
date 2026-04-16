import { extname } from "node:path";

const fileTypeFallbackExt: Record<string, string> = {
  pdf: "pdf",
  image: "jpg",
  scan: "pdf",
};

/**
 * Extension for `original.{ext}` blob keys, preferring the client-provided filename.
 */
export function extensionForOriginalBlob(
  originalFilename: string,
  fileType: string,
): string {
  const ext = extname(originalFilename).replace(/^\./, "").toLowerCase();
  if (ext && /^[a-z0-9]+$/i.test(ext)) {
    return ext;
  }
  return fileTypeFallbackExt[fileType.toLowerCase()] ?? "bin";
}
