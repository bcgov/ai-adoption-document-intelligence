import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, Min } from "class-validator";

export class ValidateDatasetRequestDto {
  @ApiPropertyOptional({
    description: "Number of samples to validate (validates all if omitted)",
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSize?: number;
}
