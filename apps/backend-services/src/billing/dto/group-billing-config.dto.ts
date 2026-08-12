import { ApiProperty } from "@nestjs/swagger";

/**
 * Response DTO for a group's billing configuration, including its spending cap.
 */
export class GroupBillingConfigDto {
  @ApiProperty({ description: "Billing config record ID" })
  id!: string;

  @ApiProperty({ description: "Group ID this config belongs to" })
  group_id!: string;

  @ApiProperty({
    description:
      "Monthly spending cap in dollars. Null means no cap is enforced.",
    nullable: true,
    type: Number,
  })
  monthly_cap_dollars!: number | null;

  @ApiProperty({
    description: "User ID of the platform admin who last configured the cap.",
    nullable: true,
  })
  cap_configured_by!: string | null;

  @ApiProperty({
    description: "Timestamp when the cap was last configured.",
    nullable: true,
  })
  cap_configured_at!: Date | null;

  @ApiProperty({ description: "Record creation timestamp" })
  created_at!: Date;
}
