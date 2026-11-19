import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class FlagSessionDto {
  @ApiPropertyOptional({
    description:
      "Short note on why the session is being flagged, shown to whoever takes it over next",
  })
  @IsOptional()
  @IsString()
  note?: string;
}
