import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class UpdateVersionDto {
  @ApiPropertyOptional({
    description: "Human-readable name for this dataset version",
    example: "Q4 invoices",
  })
  @IsString()
  @IsOptional()
  name?: string;
}
