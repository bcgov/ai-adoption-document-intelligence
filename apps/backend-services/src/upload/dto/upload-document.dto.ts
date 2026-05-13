import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export enum FileType {
  PDF = "pdf",
  IMAGE = "image",
  SCAN = "scan",
}

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  file!: string; // base64-encoded file

  @IsEnum(FileType)
  @IsNotEmpty()
  @ApiProperty({ enum: FileType })
  file_type!: FileType;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  original_filename?: string;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      "Azure model id to run against. If omitted, the workflow's ctx.modelId.defaultValue is used.",
    example: "prebuilt-read",
  })
  model_id?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      "Target group. Optional when authenticating with an API key (inferred from the key's group).",
  })
  group_id?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      "Stable workflow handle, unique within the group. Resolves to the head version unless workflow_version is set.",
    example: "ocr-only-minimal",
  })
  workflow_slug?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  @ApiPropertyOptional({
    description:
      "Pin to a specific workflow_version of the slug. Ignored without workflow_slug.",
    example: 3,
  })
  workflow_version?: number;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      "Accepts a WorkflowVersion.id or a WorkflowLineage.id (resolved to head). Mutually exclusive with workflow_slug.",
  })
  workflow_config_id?: string;
}
