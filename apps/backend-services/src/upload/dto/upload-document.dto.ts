import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';

export enum FileType {
  PDF = 'pdf',
  IMAGE = 'image',
  SCAN = 'scan',
}

export class UploadDocumentDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  file: string; // base64-encoded file

  @IsEnum(FileType)
  @IsNotEmpty()
  file_type: FileType;

  @IsString()
  @IsOptional()
  original_filename?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

