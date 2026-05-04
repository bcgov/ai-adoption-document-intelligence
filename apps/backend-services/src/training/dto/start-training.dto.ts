import { BuildMode } from "@generated/client";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class StartTrainingDto {
  @ApiPropertyOptional({ description: "Optional description for the model" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    enum: BuildMode,
    default: BuildMode.template,
    description: "Azure Document Intelligence build mode (default: template)",
  })
  @IsEnum(BuildMode)
  @IsOptional()
  buildMode?: BuildMode;

  @ApiPropertyOptional({
    description:
      "Maximum training hours budget. Only used for neural builds; ignored when buildMode=template.",
    minimum: 0.5,
  })
  @IsNumber()
  @Min(0.5)
  @IsOptional()
  maxTrainingHours?: number;
}
