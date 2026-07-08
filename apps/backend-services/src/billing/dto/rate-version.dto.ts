import { ApiProperty } from "@nestjs/swagger";

/**
 * A single activity cost entry within a rate version.
 */
export class ActivityCostItemDto {
  @ApiProperty({ description: "Activity cost record ID" })
  id!: string;

  @ApiProperty({ description: "Activity name (e.g. azureOcr.extract)" })
  activity_name!: string;

  @ApiProperty({ description: "Cost type: flat or per_page" })
  cost_type!: string;

  @ApiProperty({
    description: "Billing units charged for this activity",
    type: Number,
  })
  units!: number;
}

/**
 * A rate version with its billing configuration.
 */
export class RateVersionDto {
  @ApiProperty({ description: "Rate version ID" })
  id!: string;

  @ApiProperty({ description: "Version label (e.g. 1.0.0)" })
  version!: string;

  @ApiProperty({
    description: "Date from which this rate version is active",
    type: Date,
  })
  effective_from!: Date;

  @ApiProperty({
    description: "Dollar value per billing unit",
    type: Number,
  })
  unit_cost_dollars!: number;

  @ApiProperty({
    description: "Billing units charged per GB of storage per calendar month",
    type: Number,
  })
  units_per_gb_per_month!: number;

  @ApiProperty({
    description:
      "Upper-bound page count used in pre-flight cost estimation for per-page activities",
  })
  max_pages_assumption!: number;

  @ApiProperty({
    description:
      "Upper-bound array item count used in pre-flight cost estimation for fan-out nodes",
  })
  max_array_items_assumption!: number;

  @ApiProperty({ description: "Record creation timestamp", type: Date })
  created_at!: Date;
}
