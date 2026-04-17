import { ApiProperty } from "@nestjs/swagger";

export class OcrCacheSourceDto {
  @ApiProperty({ description: "Benchmark run ID (the cache source)" })
  id!: string;

  @ApiProperty({ description: "Definition ID that produced this run" })
  definitionId!: string;

  @ApiProperty({ description: "Human-readable definition name" })
  definitionName!: string;

  @ApiProperty({
    description: "When the source run completed",
    type: String,
    format: "date-time",
  })
  completedAt!: string;

  @ApiProperty({
    description: "Number of cached OCR samples available from this run",
  })
  sampleCount!: number;
}
