import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
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
  title: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  file: string; // base64-encoded file

  @IsEnum(FileType)
  @IsNotEmpty()
  @ApiProperty({ enum: FileType })
  file_type: FileType;

  @IsString()
  @IsOptional()
  @ApiProperty()
  original_filename?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ type: Object })
  metadata?: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  model_id: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  group_id: string;

  @IsString()
  @IsOptional()
  workflow_id?: string; // @deprecated Use workflow_config_id instead

  @IsString()
  @IsOptional()
  workflow_config_id?: string; // Reference to Workflow.id (workflow configuration)
}
