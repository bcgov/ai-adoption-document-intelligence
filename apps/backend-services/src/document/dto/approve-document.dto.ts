import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ApproveDocumentDto {
  @ApiProperty({
    description: "Whether the document is approved (true) or rejected (false)",
  })
  @IsBoolean()
  approved!: boolean;

  @ApiProperty({
    description: "Identifier of the reviewer",
    required: false,
  })
  @IsString()
  @IsOptional()
  reviewer?: string;

  @ApiProperty({
    description: "Optional comments from the reviewer",
    required: false,
  })
  @IsString()
  @IsOptional()
  comments?: string;

  @ApiProperty({
    description:
      "Required when approved is false. Reason for rejecting the document.",
    required: false,
  })
  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @ApiProperty({
    description: "Optional annotations (e.g. JSON string)",
    required: false,
  })
  @IsString()
  @IsOptional()
  annotations?: string;
}
