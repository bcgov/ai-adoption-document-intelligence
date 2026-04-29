import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LookupParamDto {
  @ApiProperty() name!: string;
  @ApiProperty({
    enum: ["string", "number", "boolean", "date", "datetime", "enum"],
  })
  type!: "string" | "number" | "boolean" | "date" | "datetime" | "enum";
}

export class OrderClauseDto {
  @ApiProperty() field!: string;
  @ApiProperty({ enum: ["asc", "desc"] }) direction!: "asc" | "desc";
}

export class LookupDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: LookupParamDto, isArray: true })
  params!: LookupParamDto[];
  @ApiProperty({ type: Object, description: "ConditionExpression tree" })
  filter!: Record<string, unknown>;
  @ApiPropertyOptional({ type: OrderClauseDto, isArray: true })
  order?: OrderClauseDto[];
  @ApiProperty({ enum: ["first", "last", "one", "all"] }) pick!:
    | "first"
    | "last"
    | "one"
    | "all";
  @ApiPropertyOptional() templateId?: string;
  @ApiPropertyOptional({ type: Object }) templateConfig?: Record<
    string,
    unknown
  >;
}
