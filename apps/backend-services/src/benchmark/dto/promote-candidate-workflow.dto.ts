import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class PromoteCandidateWorkflowDto {
  @ApiProperty({
    description:
      "Workflow version ID of the candidate to promote into the base lineage",
  })
  @IsString()
  @IsNotEmpty()
  candidateWorkflowVersionId: string;
}
