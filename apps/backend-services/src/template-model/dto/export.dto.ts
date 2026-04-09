import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

export enum ExportFormat {
  JSON = "json",
  AZURE = "azure",
}

export class ExportDto {
  @ApiProperty({
    description: "Export format",
    enum: ExportFormat,
    default: ExportFormat.AZURE,
  })
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ApiPropertyOptional({ description: "Include OCR data in export" })
  @IsOptional()
  @IsBoolean()
  includeOcrData?: boolean;

  @ApiPropertyOptional({ description: "Only export specific document IDs" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @ApiPropertyOptional({
    description: "Only export documents with status 'labeled'",
  })
  @IsOptional()
  @IsBoolean()
  labeledOnly?: boolean;
}
