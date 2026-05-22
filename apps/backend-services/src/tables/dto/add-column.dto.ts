import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { ColumnDto } from "./column.dto";

/**
 * DTO for adding a new column to a table.
 *
 * Extends {@link ColumnDto} with an optional `seed_value` that is applied to
 * all existing rows at the time the column is created. The seed value is
 * validated against the column's type before the backfill is performed.
 *
 * **This value only affects existing rows during this add operation.**
 * Rows inserted after the column is created must supply their own value.
 */
export class AddColumnDto extends ColumnDto {
  @ApiPropertyOptional({
    description:
      "Value written to all existing rows for this column at the time it is added. " +
      "Only applied during this column-add operation — not used when new rows are inserted.",
  })
  @IsOptional()
  seed_value?: unknown;
}
