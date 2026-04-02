import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class PromoteCandidateWorkflowDto {
  @ApiProperty({
    description:
      "Workflow version id of the candidate graph snapshot to apply to the base lineage",
  })
  @IsString()
  @IsNotEmpty()
  candidateWorkflowVersionId!: string;
}
