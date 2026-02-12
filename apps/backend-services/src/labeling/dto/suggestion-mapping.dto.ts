import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class SuggestionTableMappingDto {
  @ApiPropertyOptional({ description: "Table anchor text" })
  @IsOptional()
  @IsString()
  anchorText?: string;

  @ApiPropertyOptional({
    description: "Possible aliases for row label in target table",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rowLabelAliases?: string[];

  @ApiPropertyOptional({ description: "Target column header label" })
  @IsOptional()
  @IsString()
  columnLabel?: string;

  @ApiPropertyOptional({
    description: "Overlap threshold (0-1) for table-cell to words mapping",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  wordOverlapThreshold?: number;
}

export class SuggestionRuleDto {
  @ApiProperty({ description: "Field key from project schema" })
  @IsString()
  fieldKey: string;

  @ApiProperty({
    description: "Suggestion source type",
    enum: ["keyValuePair", "selectionMarkOrder", "tableCellToWords"],
  })
  @IsIn(["keyValuePair", "selectionMarkOrder", "tableCellToWords"])
  sourceType: "keyValuePair" | "selectionMarkOrder" | "tableCellToWords";

  @ApiPropertyOptional({
    description: "Possible aliases for keyValuePair key text",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyAliases?: string[];

  @ApiPropertyOptional({
    description: "Selection mark index to use for this field",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  selectionOrder?: number;

  @ApiPropertyOptional({
    description: "Optional normalizers for field value",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  normalizers?: string[];

  @ApiPropertyOptional({ description: "Confidence threshold (0-1)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;

  @ApiPropertyOptional({ type: SuggestionTableMappingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestionTableMappingDto)
  table?: SuggestionTableMappingDto;
}

export class SuggestionMappingDto {
  @ApiPropertyOptional({
    description: "Version number for the mapping contract",
  })
  @IsOptional()
  @IsNumber()
  version?: number;

  @ApiProperty({ type: [SuggestionRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestionRuleDto)
  rules: SuggestionRuleDto[];
}

export class UpdateSuggestionMappingDto {
  @ApiPropertyOptional({ type: SuggestionMappingDto, nullable: true })
  @IsOptional()
  @IsObject()
  suggestion_mapping?: SuggestionMappingDto | null;
}
