import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ApplyCandidateToBaseDto {
  @ApiProperty({
    description:
      "Workflow version ID of the candidate to apply to the base lineage",
  })
  @IsString()
  @IsNotEmpty()
  candidateWorkflowVersionId!: string;

  @ApiProperty({
    description:
      "Delete the candidate lineage, definitions pointing to it, and their runs",
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  cleanupCandidateArtifacts?: boolean;
}

export class ApplyCandidateToBaseResponseDto {
  @ApiProperty({ description: "New workflow version ID on the base lineage" })
  newBaseWorkflowVersionId!: string;

  @ApiProperty({ description: "Base workflow lineage ID" })
  baseLineageId!: string;

  @ApiProperty({ description: "New version number on the base lineage" })
  newVersionNumber!: number;

  @ApiProperty({
    description: "Whether candidate artifacts were cleaned up",
  })
  cleanedUp!: boolean;
}
