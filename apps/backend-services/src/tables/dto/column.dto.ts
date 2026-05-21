import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

const COLUMN_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "year-month",
  "enum",
] as const;

export class ColumnDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      "key must start with a lowercase letter and contain only lowercase letters, digits, and underscores",
  })
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: COLUMN_TYPES })
  @IsIn(COLUMN_TYPES)
  type!:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "year-month"
    | "enum";

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enumValues?: string[];
}
