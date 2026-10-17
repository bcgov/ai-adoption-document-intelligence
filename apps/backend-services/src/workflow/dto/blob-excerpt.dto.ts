/**
 * G-022 — response DTOs for the blob-backed values a preview dereferences.
 *
 * `OcrResultSchema` is a POINTER (`{documentId, blobPath, storage:"blob"}`) by
 * design — large payloads stay out of workflow ctx. The preview endpoints
 * resolve those pointers server-side into a BOUNDED excerpt so an author can
 * see the extracted values, and report the bounds so the client can say what
 * was omitted.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class BlobExcerptLimitsDto {
  @ApiProperty({
    description:
      "Longest string value kept verbatim; longer values are prefix-truncated.",
    example: 400,
  })
  maxStringChars!: number;

  @ApiProperty({
    description: "Most array items kept at any one array.",
    example: 5,
  })
  maxArrayItems!: number;

  @ApiProperty({
    description: "Most object keys kept at any one object.",
    example: 40,
  })
  maxObjectKeys!: number;

  @ApiProperty({
    description: "Deepest nesting walked; deeper subtrees are dropped.",
    example: 4,
  })
  maxDepth!: number;

  @ApiProperty({
    description: "Total character budget across the whole excerpt.",
    example: 8000,
  })
  maxTotalChars!: number;
}

/** Why a pointer could not be resolved. */
export type BlobExcerptUnavailableReason =
  | "not-found"
  | "unreadable"
  | "too-large"
  | "outside-group"
  | "request-limit";

export class BlobExcerptDto {
  @ApiProperty({
    description: "The blob path this excerpt was read from — the map key.",
    example: "grp-1/ocr/doc-1/ocr-result.json",
  })
  blobPath!: string;

  @ApiProperty({
    description:
      "`resolved` when the payload was read and excerpted; `unavailable` when it could not be (see `reason`).",
    enum: ["resolved", "unavailable"],
    example: "resolved",
  })
  status!: "resolved" | "unavailable";

  @ApiPropertyOptional({
    description:
      "Why the payload could not be resolved. Set only when `status` is `unavailable`. `not-found` — the blob is gone (its retention is independent of the preview cache's). `unreadable` — read or JSON parse failed. `too-large` — bigger than the excerpt byte ceiling. `outside-group` — the pointer addresses a group the caller is not authorised for. `request-limit` — the per-request dereference cap was reached before this pointer.",
    enum: [
      "not-found",
      "unreadable",
      "too-large",
      "outside-group",
      "request-limit",
    ],
  })
  reason?: BlobExcerptUnavailableReason;

  @ApiPropertyOptional({
    description:
      "The bounded projection of the payload. Present only when `status` is `resolved`. Shape follows the stored payload; every omission is listed in `omissions`.",
    type: "object",
    additionalProperties: true,
  })
  excerpt?: unknown;

  @ApiProperty({
    description: "True when anything at all was left out of `excerpt`.",
    example: true,
  })
  truncated!: boolean;

  @ApiProperty({
    description:
      "Path-anchored notes for everything omitted, e.g. `pages: showing the first 5 of 312 items`. The client renders these verbatim so a truncated preview always says it is truncated.",
    type: [String],
    example: ["pages: showing the first 5 of 312 items"],
  })
  omissions!: string[];

  @ApiPropertyOptional({
    description: "Size of the full stored payload in bytes, when known.",
    example: 4831022,
  })
  byteLength?: number;

  @ApiProperty({
    description: "The limits applied when building `excerpt`.",
    type: BlobExcerptLimitsDto,
  })
  limits!: BlobExcerptLimitsDto;
}
