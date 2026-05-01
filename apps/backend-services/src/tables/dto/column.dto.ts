import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

const COLUMN_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
] as const;

export class ColumnDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: COLUMN_TYPES })
  @IsIn(COLUMN_TYPES)
  type!: "string" | "number" | "boolean" | "date" | "datetime" | "enum";

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
