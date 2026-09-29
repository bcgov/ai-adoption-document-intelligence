/**
 * `PreviewBlobExcerptService` — resolves blob-backed values in a preview
 * cache row into bounded, self-describing excerpts (G-022).
 *
 * ## Why server-side
 *
 * The browser holds no blob credentials (MinIO / Azure keys are backend-only),
 * the preview-cache endpoints are already authorised for the workflow's group,
 * and an OCR payload can be tens of megabytes — it must be bounded BEFORE it
 * crosses the wire, not after. So the dereference happens here.
 *
 * ## What is NOT changed
 *
 * `OcrResultSchema` stays a pointer. Keeping large payloads out of workflow ctx
 * and Temporal history is a deliberate architecture decision; this service
 * reads the pointer at PREVIEW time only, and never writes back.
 *
 * ## Authorisation
 *
 * Blob paths are `{groupId}/{category}/…` (see `buildBlobFilePath`). The caller
 * has already been authorised for the workflow's group, so a pointer whose
 * first path segment names a DIFFERENT group is refused with
 * `outside-group` rather than read. A cache row is server-written, but the
 * pointer inside it originates from workflow ctx, which an author can set.
 */

import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { OcrResultSchema } from "@ai-di/graph-workflow";
import { Inject, Injectable } from "@nestjs/common";

import {
  BLOB_STORAGE,
  type BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { BlobExcerptDto } from "./dto/blob-excerpt.dto";
import {
  buildBoundedExcerpt,
  DEFAULT_EXCERPT_LIMITS,
  MAX_EXCERPT_BLOB_BYTES,
  MAX_EXCERPT_BLOBS_PER_REQUEST,
} from "./preview-blob-excerpt";

/** A blob-backed pointer found inside an `outputCtx` delta. */
interface BlobPointer {
  blobPath: string;
  byteLength?: number;
}

/**
 * Per-REQUEST dereference budget. The batch endpoint covers every node in a
 * lineage, so the cap is shared across rows: one budget per request, not per
 * row. Pointers past the cap are reported as `request-limit`, never dropped.
 */
export class BlobExcerptBudget {
  private used = 0;

  constructor(private readonly max: number = MAX_EXCERPT_BLOBS_PER_REQUEST) {}

  take(): boolean {
    if (this.used >= this.max) return false;
    this.used += 1;
    return true;
  }
}

/** Bound on the ctx walk that finds pointers (deltas are shallow in practice). */
const MAX_CTX_SCAN_DEPTH = 8;

/**
 * True when `value` is a blob-backed artifact pointer. Validated against the
 * canonical `OcrResultSchema` rather than a hand-rolled shape check, so the
 * two cannot drift.
 */
export function isBlobBackedValue(value: unknown): boolean {
  return OcrResultSchema.safeParse(value).success;
}

/** Collect every distinct blob pointer inside an `outputCtx` delta. */
export function collectBlobPointers(
  outputCtx: unknown,
  depth = 0,
  found: Map<string, BlobPointer> = new Map(),
): Map<string, BlobPointer> {
  if (depth > MAX_CTX_SCAN_DEPTH || outputCtx === null) return found;
  if (Array.isArray(outputCtx)) {
    for (const item of outputCtx) collectBlobPointers(item, depth + 1, found);
    return found;
  }
  if (typeof outputCtx !== "object") return found;

  const parsed = OcrResultSchema.safeParse(outputCtx);
  if (parsed.success) {
    if (!found.has(parsed.data.blobPath)) {
      found.set(parsed.data.blobPath, {
        blobPath: parsed.data.blobPath,
        byteLength: parsed.data.byteLength,
      });
    }
    // A pointer is a leaf — nothing blob-backed nests inside one.
    return found;
  }

  for (const child of Object.values(outputCtx as Record<string, unknown>)) {
    collectBlobPointers(child, depth + 1, found);
  }
  return found;
}

function unavailable(
  pointer: BlobPointer,
  reason: BlobExcerptDto["reason"],
): BlobExcerptDto {
  return {
    blobPath: pointer.blobPath,
    status: "unavailable",
    reason,
    truncated: false,
    omissions: [],
    ...(pointer.byteLength !== undefined
      ? { byteLength: pointer.byteLength }
      : {}),
    limits: { ...DEFAULT_EXCERPT_LIMITS },
  };
}

@Injectable()
export class PreviewBlobExcerptService {
  constructor(
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Resolve every blob-backed value in `outputCtx` into a bounded excerpt,
   * keyed by blob path. Returns `undefined` when the row holds no pointers, so
   * the field stays absent from the response for the majority of nodes.
   *
   * @param groupId  The workflow's group. Pointers addressing another group's
   *                 blobs are refused, not read.
   */
  async resolveOutputCtx(
    outputCtx: unknown,
    groupId: string,
    budget: BlobExcerptBudget,
  ): Promise<Record<string, BlobExcerptDto> | undefined> {
    const pointers = collectBlobPointers(outputCtx);
    if (pointers.size === 0) return undefined;

    const excerpts: Record<string, BlobExcerptDto> = {};
    for (const pointer of pointers.values()) {
      excerpts[pointer.blobPath] = await this.resolveOne(
        pointer,
        groupId,
        budget,
      );
    }
    return excerpts;
  }

  private async resolveOne(
    pointer: BlobPointer,
    groupId: string,
    budget: BlobExcerptBudget,
  ): Promise<BlobExcerptDto> {
    // `{groupId}/{category}/…` — refuse a pointer outside the group the caller
    // was authorised for rather than reading it.
    if (pointer.blobPath.split("/")[0] !== groupId) {
      return unavailable(pointer, "outside-group");
    }
    if (
      pointer.byteLength !== undefined &&
      pointer.byteLength > MAX_EXCERPT_BLOB_BYTES
    ) {
      return unavailable(pointer, "too-large");
    }
    // A malformed path can never address a blob — report it as unreadable
    // rather than letting it masquerade as a missing payload.
    let validated: ReturnType<typeof validateBlobFilePath>;
    try {
      validated = validateBlobFilePath(pointer.blobPath);
    } catch {
      return unavailable(pointer, "unreadable");
    }
    if (!budget.take()) {
      return unavailable(pointer, "request-limit");
    }

    let buffer: Buffer;
    try {
      buffer = await this.blobStorage.read(validated);
    } catch (error) {
      // A missing blob is normal, not exceptional: blob retention is
      // independent of the preview cache's TTL, so a fresh cache row can
      // outlive its payload. Degrade, don't fail the whole preview.
      this.logger.debug("Preview blob dereference failed", {
        blobPath: pointer.blobPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return unavailable(pointer, "not-found");
    }

    // Even with an unknown declared size, never parse an oversized payload.
    if (buffer.byteLength > MAX_EXCERPT_BLOB_BYTES) {
      return {
        ...unavailable(pointer, "too-large"),
        byteLength: buffer.byteLength,
      };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(buffer.toString("utf8"));
    } catch {
      return {
        ...unavailable(pointer, "unreadable"),
        byteLength: buffer.byteLength,
      };
    }

    const excerpt = buildBoundedExcerpt(payload, DEFAULT_EXCERPT_LIMITS);
    return {
      blobPath: pointer.blobPath,
      status: "resolved",
      excerpt: excerpt.value,
      truncated: excerpt.truncated,
      omissions: excerpt.omissions,
      byteLength: buffer.byteLength,
      limits: { ...DEFAULT_EXCERPT_LIMITS },
    };
  }
}
