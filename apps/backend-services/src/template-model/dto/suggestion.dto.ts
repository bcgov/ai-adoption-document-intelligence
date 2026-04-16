import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { BoundingBoxDto } from "./label.dto";

export class LabelSuggestionDto {
  @ApiProperty({ description: "Field key to assign" })
  @IsString()
  field_key!: string;

  @ApiProperty({ description: "Label name for persistence" })
  @IsString()
  label_name!: string;

  @ApiPropertyOptional({ description: "Suggested text value" })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiProperty({ description: "Page number (1-indexed)" })
  @IsNumber()
  @Min(1)
  page_number!: number;

  @ApiProperty({ description: "Element IDs to assign in UI" })
  @IsArray()
  @IsString({ each: true })
  element_ids!: string[];

  @ApiProperty({ description: "Suggested bounding box coordinates" })
  bounding_box!: BoundingBoxDto;

  @ApiProperty({
    description: "Suggestion source type",
    enum: ["keyValuePair", "selectionMarkOrder", "tableCellToWords"],
  })
  @IsString()
  source_type!: "keyValuePair" | "selectionMarkOrder" | "tableCellToWords";

  @ApiPropertyOptional({ description: "Suggestion confidence score" })
  @IsOptional()
  @IsNumber()
  confidence?: number;

  @ApiPropertyOptional({ description: "Human-readable explanation" })
  @IsOptional()
  @IsString()
  explanation?: string;
}
