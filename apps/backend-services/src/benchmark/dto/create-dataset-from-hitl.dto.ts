import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateDatasetFromHitlDto {
  @ApiProperty({ description: "Dataset name" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: "Dataset description" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: "Dataset metadata",
    type: "object",
    additionalProperties: true,
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty({ description: "Group ID that owns this dataset" })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({
    description: "Array of HITL document IDs to include",
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  documentIds: string[];
}

export class AddVersionFromHitlDto {
  @ApiPropertyOptional({
    description: "Version label (auto-generated if omitted)",
  })
  @IsString()
  @IsOptional()
  version?: string;

  @ApiPropertyOptional({ description: "Human-readable name for this version" })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: "Array of HITL document IDs to include in this version",
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  documentIds: string[];
}
