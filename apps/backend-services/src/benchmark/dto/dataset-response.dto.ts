import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DatasetResponseDto {
  @ApiProperty({ description: 'Dataset ID' })
  id: string;

  @ApiProperty({ description: 'Dataset name' })
  name: string;

  @ApiProperty({ description: 'Dataset description', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Dataset metadata', type: 'object', additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty({ description: 'Storage path for the dataset' })
  storagePath: string;

  @ApiProperty({ description: 'User who created the dataset' })
  createdBy: string;

  @ApiProperty({ description: 'Group ID that owns this dataset' })
  groupId: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Number of versions' })
  versionCount?: number;

  @ApiPropertyOptional({
    description: 'Recent dataset versions',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        version: { type: 'string' },
        documentCount: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  recentVersions?: Array<{
    id: string;
    version: string;
    documentCount: number;
    createdAt: Date;
  }>;
}
