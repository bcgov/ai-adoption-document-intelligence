import { BuildMode } from "@generated/client";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

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
      "Maximum training hours budget. Only used for neural builds; ignored when buildMode=template. Capped at 10 hours — Azure's free-tier ceiling. Requests above 10 require a configured Azure budget and are rejected here as a guardrail against unintended spend.",
    minimum: 0.5,
    maximum: 10,
  })
  @IsNumber()
  @Min(0.5)
  @Max(10)
  @IsOptional()
  maxTrainingHours?: number;
}
