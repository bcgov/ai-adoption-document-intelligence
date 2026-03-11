import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class VersionResponseDto {
  @ApiProperty({ description: 'Version ID' })
  id: string;

  @ApiProperty({ description: 'Dataset ID' })
  datasetId: string;

  @ApiProperty({ description: 'Version label' })
  version: string;

  @ApiProperty({ description: 'Version name', nullable: true })
  name: string | null;

  @ApiProperty({ description: 'Storage prefix for this version', nullable: true })
  storagePrefix: string | null;

  @ApiProperty({ description: 'Path to the dataset manifest file' })
  manifestPath: string;

  @ApiProperty({ description: 'Number of documents in this version' })
  documentCount: number;

  @ApiProperty({ description: 'JSON schema for ground truth validation', nullable: true, type: 'object', additionalProperties: true })
  groundTruthSchema: Record<string, unknown> | null;

  @ApiProperty({ description: 'Whether this version is frozen' })
  frozen: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Splits associated with this version',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        sampleCount: { type: 'number' },
      },
    },
  })
  splits?: Array<{
    id: string;
    name: string;
    type: string;
    sampleCount: number;
  }>;
}
