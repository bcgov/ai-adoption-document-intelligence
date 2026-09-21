import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class RejectSessionDto {
  @ApiProperty({ description: "Reason the document is being rejected" })
  @IsString()
  @IsNotEmpty()
  rejectionReason!: string;

  @ApiPropertyOptional({ description: "Optional comments from the reviewer" })
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
