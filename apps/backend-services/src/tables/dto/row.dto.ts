import { ApiProperty } from "@nestjs/swagger";

export class CreateRowDto {
  @ApiProperty({
    type: Object,
    description: "Row data shaped per column definitions",
  })
  data!: Record<string, unknown>;
}

export class UpdateRowDto {
  @ApiProperty({ type: Object }) data!: Record<string, unknown>;
  @ApiProperty({ type: String, format: "date-time" })
  expected_updated_at!: Date;
}

export class RowDto {
  @ApiProperty() id!: string;
  @ApiProperty() group_id!: string;
  @ApiProperty() table_id!: string;
  @ApiProperty({ type: Object }) data!: Record<string, unknown>;
  @ApiProperty({ type: String, format: "date-time" }) updated_at!: Date;
}

export class RowListDto {
  @ApiProperty({ type: RowDto, isArray: true }) rows!: RowDto[];
  @ApiProperty() total!: number;
}
