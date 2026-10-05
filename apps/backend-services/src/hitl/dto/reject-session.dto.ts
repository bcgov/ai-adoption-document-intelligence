import { RejectionReason } from "@generated/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class RejectSessionDto {
  @ApiProperty({
    enum: RejectionReason,
    description: "Why the reviewer is rejecting the document",
  })
  @IsEnum(RejectionReason)
  rejectionReason!: RejectionReason;

  @ApiPropertyOptional({
    description:
      "Optional comment explaining the rejection. Stored on the review session and shown with the document.",
  })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({
    description: "Optional annotations (e.g. JSON string)",
  })
  @IsOptional()
  @IsString()
  annotations?: string;
}
