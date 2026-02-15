/**
 * Update Split Request DTO
 *
 * Used to update an existing unfrozen split.
 * See US-033: Split Management UI
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class UpdateSplitDto {
  @ApiProperty({
    description: "Updated array of sample IDs for this split",
    example: ["sample-1", "sample-2", "sample-4"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  sampleIds: string[];
}
