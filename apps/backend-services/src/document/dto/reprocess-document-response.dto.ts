import { DocumentStatus } from "@generated/client";
import { ApiProperty } from "@nestjs/swagger";

/** Response body for a successful document re-run (202 Accepted). */
export class ReprocessDocumentResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    description: "Temporal workflow execution ID of the new run.",
    example: "graph-65fafe87-9fa7-46e6-9f1e-ba2ef326e3be",
  })
  workflowExecutionId!: string;

  @ApiProperty({
    enum: DocumentStatus,
    description: "Document status after the re-run was started.",
    example: DocumentStatus.ongoing_ocr,
  })
  status!: DocumentStatus;
}
