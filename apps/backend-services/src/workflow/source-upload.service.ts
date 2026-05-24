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

    const filename = `${randomUUID()}-${file.originalname}`;
    const blobKey = buildBlobFilePath(
      groupId,
      OperationCategory.OCR,
      ["workflow-uploads", workflowId, sourceNodeId],
      filename,
    );

    await this.blobStorage.write(blobKey, file.buffer);

    return blobKey;
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
