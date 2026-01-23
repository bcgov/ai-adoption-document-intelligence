import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export enum FieldType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  SELECTION_MARK = "selectionMark",
  SIGNATURE = "signature",
  TABLE = "table",
}

export enum TableType {
  DYNAMIC = "dynamic",
  FIXED = "fixed",
}

export class TableColumnDto {
  @ApiProperty({ description: "Column key" })
  @IsString()
  key: string;

  @ApiProperty({ description: "Column label" })
  @IsString()
  label: string;

  @ApiPropertyOptional({ description: "Column type", enum: FieldType })
  @IsOptional()
  @IsEnum(FieldType)
  type?: FieldType;
}

export class CreateFieldDefinitionDto {
  @ApiProperty({ description: "Unique field key" })
  @IsString()
  field_key: string;

  @ApiProperty({ description: "Field type", enum: FieldType })
  @IsEnum(FieldType)
  field_type: FieldType;

  @ApiPropertyOptional({ description: "Field format (e.g., currency, dmy)" })
  @IsOptional()
  @IsString()
  field_format?: string;

  @ApiPropertyOptional({ description: "Display order" })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ description: "Whether field is required" })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: "Whether field is a table" })
  @IsOptional()
  @IsBoolean()
  is_table?: boolean;

  @ApiPropertyOptional({
    description: "Table type (for table fields)",
    enum: TableType,
  })
  @IsOptional()
  @IsEnum(TableType)
  table_type?: TableType;

  @ApiPropertyOptional({
    description: "Column headers (for table fields)",
    type: [TableColumnDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableColumnDto)
  column_headers?: TableColumnDto[];
}

export class UpdateFieldDefinitionDto {
  @ApiPropertyOptional({ description: "Field format" })
  @IsOptional()
  @IsString()
  field_format?: string;

  @ApiPropertyOptional({ description: "Display order" })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;

  @ApiPropertyOptional({ description: "Whether field is required" })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({
    description: "Column headers (for table fields)",
    type: [TableColumnDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TableColumnDto)
  column_headers?: TableColumnDto[];
}

export class ReorderFieldsDto {
  @ApiProperty({ description: "Ordered list of field IDs" })
  @IsArray()
  @IsString({ each: true })
  fieldIds: string[];
}

// Legacy DTO for backwards compatibility
export class FieldDefinitionDto extends CreateFieldDefinitionDto {}
