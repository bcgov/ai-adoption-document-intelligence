import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CustomNeuralBuildsDto {
  @ApiProperty({
    description: "Neural builds used in the current quota window",
  })
  used!: number;

  @ApiProperty({ description: "Quota cap of neural builds per window" })
  quota!: number;

  @ApiProperty({ description: "ISO timestamp when the quota resets" })
  quotaResetDateTime!: string;
}

export class TrainingInfoDto {
  @ApiPropertyOptional({
    description: "Azure region of the Document Intelligence resource",
  })
  region?: string;

  @ApiPropertyOptional({
    description: "Custom neural document model build quota / usage",
    type: CustomNeuralBuildsDto,
  })
  customNeuralDocumentModelBuilds?: CustomNeuralBuildsDto;

  @ApiPropertyOptional({
    description:
      "Raw Azure /info response — passes through any fields not explicitly modelled above for forward-compat (e.g. free-hours quota when Azure adds one).",
    type: "object",
    additionalProperties: true,
  })
  raw?: Record<string, unknown>;
}
