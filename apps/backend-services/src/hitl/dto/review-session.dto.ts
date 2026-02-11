import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class ReviewSessionDto {
  @ApiProperty({ description: "Document ID to review" })
  @IsString()
  documentId: string;

  @ApiProperty({ description: "Minimum confidence threshold", required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;
}
