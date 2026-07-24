import { createHash } from "node:crypto";

/** SHA-256 hex digest of raw file bytes (original upload content). */
export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
