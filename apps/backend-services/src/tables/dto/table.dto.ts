import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTableDto {
  @ApiProperty({ description: "Group ID this table belongs to" })
  group_id!: string;

  @ApiProperty({
    description: "Stable identifier, unique within group",
    example: "check_run_schedule",
  })
  table_id!: string;

  @ApiProperty({ description: "Display label" })
  label!: string;

  @ApiPropertyOptional({ description: "Optional description" })
  description?: string | null;
}

export class UpdateTableMetadataDto {
  @ApiPropertyOptional() label?: string;
  @ApiPropertyOptional() description?: string | null;
}

export class TableSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() group_id!: string;
  @ApiProperty() table_id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() row_count!: number;
  @ApiProperty({ type: String, format: "date-time" }) updated_at!: Date;
}

export class TableDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() group_id!: string;
  @ApiProperty() table_id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty({ type: Object, isArray: true }) columns!: unknown[];
  @ApiProperty({ type: Object, isArray: true }) lookups!: unknown[];
  @ApiProperty({ type: String, format: "date-time" }) updated_at!: Date;
}
