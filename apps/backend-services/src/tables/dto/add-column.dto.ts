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
    type: Object,
    description:
      "Any JSON-compatible value written to all existing rows that are missing a value for this column. " +
      "Type-validated against the column schema in the service layer (not at the HTTP boundary). " +
      "Only applied during this operation — not used when new rows are inserted.",
  })
  @IsOptional()
  seed_value?: unknown;
}
