import { ApiProperty } from "@nestjs/swagger";

/**
 * G-050 — what `DELETE /api/workflows/:id` would take with it.
 *
 * Deleting a lineage cascades to every version under it. Benchmark
 * definitions and ground-truth jobs are protected by `Restrict` FKs and simply
 * block the delete; documents are not — `Document.workflowVersion` is
 * `onDelete: SetNull`, so the record of which graph produced each document is
 * erased with no error raised.
 *
 * This is a pre-flight read so the confirmation can name that cost. It never
 * blocks: a workflow that has processed documents has to stay deletable.
 */
export class WorkflowDeleteImpactDto {
  @ApiProperty({
    description: "Versions that would be deleted with the lineage.",
    example: 4,
  })
  versionCount!: number;

  @ApiProperty({
    description:
      "Documents pinned to one of those versions. Deleting does not remove them, but does clear the link recording which graph produced them.",
    example: 233,
  })
  documentCount!: number;
}
