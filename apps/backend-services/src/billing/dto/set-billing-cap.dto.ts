import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, Min } from "class-validator";

/**
 * Request body for setting or clearing a group's monthly spending cap.
 */
export class SetBillingCapDto {
  @ApiPropertyOptional({
    description:
      "Monthly spending cap in dollars. Set to null to remove the cap entirely.",
    nullable: true,
    type: Number,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_cap_dollars?: number | null;
}
