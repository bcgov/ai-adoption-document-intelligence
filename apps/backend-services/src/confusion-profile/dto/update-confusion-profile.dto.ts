/**
 * Request body for updating a confusion profile.
 */

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class UpdateConfusionProfileDto {
  @ApiPropertyOptional({ description: "Profile name" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Profile description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Confusion matrix: { trueChar: { recognizedChar: count } }",
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  matrix?: Record<string, Record<string, number>>;

  @ApiPropertyOptional({
    description: "Arbitrary metadata JSON",
    type: "object",
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
