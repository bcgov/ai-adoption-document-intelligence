import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateVersionDto {
  @ApiPropertyOptional({
    description: "Human-readable name for this dataset version",
    example: "Q4 invoices",
  })
  @IsString()
  @IsOptional()
  name?: string;
}
