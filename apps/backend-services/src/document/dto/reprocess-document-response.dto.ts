import { DocumentStatus } from "@generated/client";
import { ApiProperty } from "@nestjs/swagger";

/** Response body for a successful document re-run (202 Accepted). */
export class ReprocessDocumentResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    description:
      "Temporal run ID (firstExecutionRunId) of the new execution attempt. Unique per re-run; use as the workflowExecutionId key for GET /api/usage/groups/:groupId/runs/:workflowExecutionId.",
    example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  })
  workflowExecutionId!: string;

  @ApiProperty({
    enum: DocumentStatus,
    description: "Document status after the re-run was started.",
    example: DocumentStatus.ongoing_ocr,
  })
  status!: DocumentStatus;
}
