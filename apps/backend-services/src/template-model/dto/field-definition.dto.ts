import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export enum FieldType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  SELECTION_MARK = "selectionMark",
  SIGNATURE = "signature",
}

export class CreateFieldDefinitionDto {
  @ApiProperty({ description: "Unique field key" })
  @IsString()
  field_key!: string;

  @ApiProperty({ description: "Field type", enum: FieldType })
  @IsEnum(FieldType)
  field_type!: FieldType;

  @ApiPropertyOptional({ description: "Field format (e.g., currency, dmy)" })
  @IsOptional()
  @IsString()
  field_format?: string;

  @ApiPropertyOptional({
    description: "JSON format spec for normalization/validation",
  })
  @IsOptional()
  @IsString()
  format_spec?: string;

  @ApiPropertyOptional({
    description:
      "One-line plain-English description of what the field is and where it sits on the form. Used as instructions when an LLM suggests fields and labels; not exported to training files. Blank clears it.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: "Display order" })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;
}

export class UpdateFieldDefinitionDto {
  @ApiPropertyOptional({ description: "Field format" })
  @IsOptional()
  @IsString()
  field_format?: string;

  @ApiPropertyOptional({
    description: "JSON format spec for normalization/validation",
  })
  @IsOptional()
  @IsString()
  format_spec?: string;

  @ApiPropertyOptional({
    description:
      "One-line plain-English description of what the field is and where it sits on the form. Used as instructions when an LLM suggests fields and labels; not exported to training files. Blank clears it.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: "Display order" })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;
}
