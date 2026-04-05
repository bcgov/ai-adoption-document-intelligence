/**
 * Request body for creating a confusion profile with an explicit matrix.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class CreateConfusionProfileDto {
  @ApiProperty({ description: "Profile name" })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Profile description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: "Confusion matrix: { trueChar: { recognizedChar: count } }",
    type: "object",
    additionalProperties: true,
  })
  @IsNotEmpty()
  @IsObject()
  matrix: Record<string, Record<string, number>>;
}
