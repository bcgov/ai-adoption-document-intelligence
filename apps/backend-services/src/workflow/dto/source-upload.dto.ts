/**
 * Source Upload DTO
 *
 * Swagger response shape for the
 * `POST /api/workflows/:id/sources/:sourceNodeId/upload` endpoint.
 *
 * The response object carries:
 *
 * - A single **dynamic** property whose key is the source.upload node's
 *   configured `ctxKey` parameter (default `"documentUrl"`) and whose
 *   value is the blob storage key produced by the upload. Because the
 *   property name is dynamic and not enumerable at schema-generation
 *   time, the controller's `@ApiOkResponse({ schema: { ... } })`
 *   expresses the contract directly per OpenAPI 3.0 — i.e. "an object
 *   with string-valued properties of unspecified keys".
 *
 * - Two **fixed** properties added in Phase 4 (US-146): `runId` is the
 *   Temporal workflow execution id of the run kicked off immediately
 *   after the upload commits to blob storage; `workflowVersionId` is
 *   the `WorkflowVersion.id` used for that run (head or pinned —
 *   resolved by the `WorkflowService.resolveLineageAndVersion`
 *   helper). The frontend stores `runId` in canvas state and starts
 *   the status-polling loop.
 *
 * Consumers in generated clients see this typed shape: the dynamic
 * ctxKey-keyed entry is modelled as an index signature, and the two
 * fixed fields are declared properties.
 *
 * Spec: feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L25,
 *       docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §5.1.
 */

import { ApiProperty } from "@nestjs/swagger";

export class SourceUploadResponseDto {
  @ApiProperty({
    description:
      "Temporal workflow execution id of the run kicked off immediately " +
      "after this upload committed to blob storage. The frontend stores " +
      "this in canvas state to start the per-node status polling loop.",
    example: "graph-adhoc-9c1f5fb8-3a3a-4e2f-9aeb-9b3a4f9b0d31",
  })
  runId!: string;

  @ApiProperty({
    description:
      "`WorkflowVersion.id` used for the kicked-off run — read from the " +
      "`WorkflowService.resolveLineageAndVersion` helper so head + " +
      "pinned versions both work.",
    example: "wv-abc123",
  })
  workflowVersionId!: string;

  /**
   * Dynamic ctxKey-keyed entry. The OpenAPI schema for this is declared
   * via `additionalProperties: { type: "string" }` in the controller's
   * `@ApiOkResponse` so generated clients see the index-signature shape
   * alongside the fixed `runId` / `workflowVersionId` properties.
   */
  [ctxKey: string]: string;
}
