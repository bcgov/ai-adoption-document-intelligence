import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class StartTrainingDto {
  @ApiPropertyOptional({ description: "Optional description for the model" })
  @IsString()
  @IsOptional()
  description?: string;
}
