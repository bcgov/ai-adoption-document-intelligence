import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTableDto {
  @ApiProperty({ description: "Group ID this table belongs to" })
  @IsString()
  @IsNotEmpty()
  group_id!: string;

  @ApiProperty({
    description: "Stable identifier, unique within group",
    example: "check_run_schedule",
  })
  @IsString()
  @IsNotEmpty()
  table_id!: string;

  @ApiProperty({ description: "Display label" })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({ description: "Optional description" })
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateTableMetadataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;
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
