import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class SpanDto {
  @ApiProperty({ description: "Offset in the document content" })
  @IsNumber()
  offset: number;

  @ApiProperty({ description: "Length of the span" })
  @IsNumber()
  length: number;
}

export class BoundingBoxDto {
  @ApiProperty({ description: "Polygon points as array of numbers [x1,y1,x2,y2,...]" })
  @IsArray()
  @IsNumber({}, { each: true })
  polygon: number[];

  @ApiPropertyOptional({ description: "Page width for coordinate normalization" })
  @IsOptional()
  @IsNumber()
  pageWidth?: number;

  @ApiPropertyOptional({ description: "Page height for coordinate normalization" })
  @IsOptional()
  @IsNumber()
  pageHeight?: number;

  @ApiPropertyOptional({ description: "Span information from OCR for ordering" })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpanDto)
  span?: SpanDto;
}

export class CreateLabelDto {
  @ApiProperty({ description: "Field key this label belongs to" })
  @IsString()
  field_key: string;

  @ApiProperty({ description: "Label name (for table cells: field/row/col)" })
  @IsString()
  label_name: string;

  @ApiPropertyOptional({ description: "Extracted or labeled value" })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiProperty({ description: "Page number (1-indexed)" })
  @IsNumber()
  @Min(1)
  page_number: number;

  @ApiProperty({ description: "Bounding box coordinates" })
  @ValidateNested()
  @Type(() => BoundingBoxDto)
  bounding_box: BoundingBoxDto;

  @ApiPropertyOptional({ description: "Confidence score (0-1)" })
  @IsOptional()
  @IsNumber()
  confidence?: number;

  @ApiPropertyOptional({ description: "Whether label was manually created" })
  @IsOptional()
  @IsBoolean()
  is_manual?: boolean;
}

export class SaveLabelsDto {
  @ApiProperty({ description: "Array of labels to save", type: [CreateLabelDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLabelDto)
  labels: CreateLabelDto[];

  @ApiPropertyOptional({ description: "Whether to replace all existing labels" })
  @IsOptional()
  @IsBoolean()
  replaceAll?: boolean;
}

// Legacy DTO for backwards compatibility
export class LabelDto extends CreateLabelDto {
  @ApiPropertyOptional({ description: "Document ID (deprecated, use URL param)" })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: "Field name (deprecated, use field_key)" })
  @IsOptional()
  @IsString()
  fieldName?: string;
}
