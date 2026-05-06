import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

const PARAM_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
] as const;

const PICK_STRATEGIES = ["first", "last", "one", "all"] as const;

export class LookupParamDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: PARAM_TYPES })
  @IsIn(PARAM_TYPES)
  type!: "string" | "number" | "boolean" | "date" | "datetime" | "enum";
}

export class OrderClauseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  field!: string;

  @ApiProperty({ enum: ["asc", "desc"] })
  @IsIn(["asc", "desc"])
  direction!: "asc" | "desc";
}

export class LookupDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: LookupParamDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LookupParamDto)
  params!: LookupParamDto[];

  @ApiProperty({ type: Object, description: "ConditionExpression tree" })
  @IsObject()
  filter!: Record<string, unknown>;

  @ApiPropertyOptional({ type: OrderClauseDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderClauseDto)
  order?: OrderClauseDto[];

  @ApiProperty({ enum: PICK_STRATEGIES })
  @IsIn(PICK_STRATEGIES)
  pick!: "first" | "last" | "one" | "all";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  templateConfig?: Record<string, unknown>;
}
