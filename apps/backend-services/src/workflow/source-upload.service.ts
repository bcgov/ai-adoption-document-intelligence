/**
 * Source Upload Service (US-114)
 *
 * Streams a multipart upload destined for a `source.upload` node into
 * the existing blob storage (reused, NOT a new abstraction). The
 * resulting blob key is then returned to the caller, keyed by the
 * source's configured `ctxKey`, so the frontend can forward the object
 * verbatim as `initialCtx` on a subsequent `POST /runs`.
 *
 * The service is intentionally tiny — MIME + size validation, blob-key
 * construction, and the `blobStorage.write(...)` call. Catalog lookup
 * + node-resolution remain in the controller (mirroring the existing
 * `WorkflowController.startRun` shape).
 *
 * See DOCUMENT_SOURCES_DESIGN.md §4.3.
 */

import { randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from "@nestjs/common";
import {
  BLOB_STORAGE,
  type BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import {
  buildBlobFilePath,
  OperationCategory,
  validateBlobFilePath,
} from "@/blob-storage/storage-path-builder";

/**
 * Resolved upload parameters as merged from the source.upload catalog
 * defaults (see DOCUMENT_SOURCES_DESIGN.md §3.2).
 */
export interface SourceUploadParameters {
  allowedMimeTypes: string[];
  maxFileSizeMB: number;
  ctxKey: string;
}

/**
 * Subset of `Express.Multer.File` we actually consume — declared
 * explicitly so the service contract is decoupled from the global type
 * augmentation and is trivially mockable in unit tests.
 */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class SourceUploadService {
  constructor(
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
  ) {}

  /**
   * Validate the file against the resolved source parameters and stream
   * it to blob storage. Returns the blob key (which matches the shape
   * the OCR pipeline already consumes — see
   * `apps/temporal/src/activities/*` where `fileData.blobKey` is read
   * directly via `blobStorage.read(...)`).
   *
   * @param file       The uploaded file (subset of `Express.Multer.File`).
   * @param parameters The resolved `source.upload` parameters.
   * @param groupId    The workflow's group id — used to scope the blob path.
   * @param workflowId The workflow lineage id — used to namespace the upload.
   * @param sourceNodeId The source node id — used to namespace the upload.
   */
  async uploadFileForSource(
    file: UploadedFileLike,
    parameters: SourceUploadParameters,
    groupId: string,
    workflowId: string,
    sourceNodeId: string,
  ): Promise<string> {
    this.assertMimeAllowed(file.mimetype, parameters.allowedMimeTypes);
    this.assertSizeWithinLimit(
      file.size,
      file.originalname,
      parameters.maxFileSizeMB,
    );
    // The multipart `Content-Type` is attacker-controlled, so a passing
    // MIME-allowlist check is not enough. Sniff the leading bytes and
    // reject when they contradict the declared (and allowed) type.
    this.assertContentMatchesDeclaredMime(file.buffer, file.mimetype);

    // `file.originalname` is attacker-controlled and is otherwise joined
    // verbatim into the blob key. A crafted value (`../../...`) would
    // escape the group-scoped prefix and enable a cross-tenant write, so
    // we reduce it to a safe basename before composing the key.
    const safeName = sanitiseUploadFilename(file.originalname);
    const filename = `${randomUUID()}-${safeName}`;
    const blobKey = buildBlobFilePath(
      groupId,
      OperationCategory.WORKFLOW,
      ["workflow-uploads", workflowId, sourceNodeId],
      filename,
    );

    // Fail closed: re-validate the fully-composed key through the shared
    // guard. If sanitisation ever regressed and the key escaped the
    // `{groupId}/{category}/...` shape, this throws before any write.
    const validatedKey = validateBlobFilePath(blobKey);

    await this.blobStorage.write(validatedKey, file.buffer);

    return validatedKey;
  }

  /**
   * MIME glob matcher: `"image/*"` matches `"image/png"` etc., `"*"`
   * alone matches anything, otherwise exact equality.
   */
  private assertMimeAllowed(mimetype: string, allowed: string[]): void {
    if (mimeMatches(mimetype, allowed)) return;
    throw new BadRequestException(
      `File MIME type \`${mimetype}\` is not permitted by this source. ` +
        `Allowed: [${allowed.join(", ")}]`,
    );
  }

  private assertSizeWithinLimit(
    size: number,
    originalname: string,
    maxFileSizeMB: number,
  ): void {
    const maxBytes = maxFileSizeMB * 1024 * 1024;
    if (size <= maxBytes) return;
    throw new PayloadTooLargeException(
      `File \`${originalname}\` (${size} bytes) exceeds the source's maximum ` +
        `size of ${maxFileSizeMB} MB (${maxBytes} bytes).`,
    );
  }

  /**
   * Content-sniffing guard: the declared multipart MIME has already passed
   * the source allowlist, but it is attacker-controlled. Sniff the leading
   * magic bytes of the buffer and reject when they are inconsistent with the
   * declared type. Only the types we actually support (PDF + the common
   * web image formats) carry signatures; declared types we don't have a
   * signature for are passed through (we can't disprove them) — the
   * allowlist remains the gate for those.
   */
  private assertContentMatchesDeclaredMime(
    buffer: Buffer,
    declaredMime: string,
  ): void {
    const sniffed = sniffMimeType(buffer);
    if (sniffed === undefined) return; // no recognised signature in the bytes
    if (declaredMime === sniffed) return; // declared matches sniffed exactly
    // The declared type has a known signature family but the bytes match a
    // different known type → the client lied about the content. Reject.
    if (KNOWN_SIGNATURE_MIME_TYPES.has(declaredMime)) {
      throw new BadRequestException(
        `File content does not match its declared MIME type \`${declaredMime}\` ` +
          `(sniffed \`${sniffed}\` from the file's magic bytes).`,
      );
    }
    // Declared type has no signature we can check against (e.g. text/csv) but
    // the bytes look like a known binary type. We can't prove a mismatch
    // safely (a CSV could legitimately start with arbitrary bytes), so the
    // allowlist remains the gate here.
  }
}

/**
 * Reduce an attacker-controlled upload filename to a safe basename:
 * strip any directory components (POSIX or Windows separators) and any
 * residual traversal tokens, then fall back to `"upload"` when nothing
 * usable remains. The result never contains `/`, `\`, or `..` segments,
 * so it can be safely joined into a blob key.
 */
export function sanitiseUploadFilename(originalname: string): string {
  // Normalise Windows separators to POSIX so `path.posix.basename` strips
  // both `../` and `..\` directory prefixes.
  const normalised = originalname.replace(/\\/g, "/");
  let base = path.posix.basename(normalised);
  // `basename` already drops directory components, but a bare `..` (or `.`)
  // survives as the whole basename — collapse those to nothing.
  if (base === ".." || base === ".") base = "";
  // Defensive: remove any character that could re-introduce path semantics
  // or the blob-path illegal set (`:` / `\`). Keep it conservative.
  base = base.replace(/[/\\:]/g, "");
  base = base.trim();
  return base.length > 0 ? base : "upload";
}

/**
 * MIME types for which we carry a magic-byte signature. Used to decide
 * whether a declared/sniffed mismatch is a hard rejection.
 */
const KNOWN_SIGNATURE_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/**
 * Focused magic-byte sniffer for the upload-source allowlist. Returns the
 * detected MIME type or `undefined` when no signature matches. Intentionally
 * small — no heavy dependency — covering the binary types `source.upload`
 * realistically accepts (PDF + common web images).
 */
export function sniffMimeType(buffer: Buffer): string | undefined {
  if (buffer.length < 4) return undefined;

  // PDF: "%PDF" (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: "GIF87a" / "GIF89a"
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  // WEBP: "RIFF"...."WEBP"
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  return undefined;
}

/**
 * Exported as a free function so it can be reused (e.g. by other
 * source-related validators) without instantiating the service. The
 * pattern is intentionally tiny per the story's MIME-glob spec:
 * trailing `*` → prefix match; otherwise exact equality.
 */
export function mimeMatches(mimetype: string, allowed: string[]): boolean {
  for (const pattern of allowed) {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (mimetype.startsWith(prefix)) return true;
    } else if (pattern === mimetype) {
      return true;
    }
  }
  return false;
}
