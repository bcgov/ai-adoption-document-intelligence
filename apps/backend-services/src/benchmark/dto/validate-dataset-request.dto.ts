import { IsInt, IsOptional, Min } from "class-validator";

export class ValidateDatasetRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSize?: number;
}
