/**
 * Response DTO for a confusion profile.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ConfusionProfileResponseDto {
  @ApiProperty({ description: "Profile ID" })
  id: string;

  @ApiProperty({ description: "Profile name" })
  name: string;

  @ApiPropertyOptional({ description: "Profile description" })
  description: string | null;

  @ApiProperty({
    description: "Confusion matrix: { trueChar: { recognizedChar: count } }",
    type: "object",
    additionalProperties: true,
  })
  matrix: Record<string, Record<string, number>>;

  @ApiPropertyOptional({
    description: "Metadata JSON",
    type: "object",
    additionalProperties: true,
  })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ description: "Group ID" })
  groupId: string;

  @ApiProperty({ description: "Created timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Updated timestamp" })
  updatedAt: Date;
}
