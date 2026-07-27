import { ApiProperty } from "@nestjs/swagger";
import { IsDefined, IsNumber, Min, ValidateIf } from "class-validator";

/**
 * Request body for setting or clearing a group's monthly spending cap.
 * The field must be explicitly present: omitting it entirely returns HTTP 400.
 * Pass `null` to remove the cap; pass a non-negative number to set it.
 */
export class SetBillingCapDto {
  @ApiProperty({
    description:
      "Monthly spending cap in dollars. Pass null to remove the cap entirely. The field must always be present.",
    nullable: true,
    required: true,
    type: Number,
    minimum: 0,
  })
  @IsDefined({
    message:
      "monthly_cap_dollars must be provided (use null to remove the cap)",
  })
  @ValidateIf((o: SetBillingCapDto) => o.monthly_cap_dollars !== null)
  @IsNumber()
  @Min(0)
  monthly_cap_dollars!: number | null;
}
