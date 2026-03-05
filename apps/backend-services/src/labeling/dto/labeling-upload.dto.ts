import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export enum LabelingFileType {
  PDF = "pdf",
  IMAGE = "image",
  SCAN = "scan",
}

export class LabelingUploadDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  title: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  file: string; // base64-encoded file

  @IsEnum(LabelingFileType)
  @IsNotEmpty()
  @ApiProperty({ enum: LabelingFileType })
  file_type: LabelingFileType;

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
  group_id: string;
}
