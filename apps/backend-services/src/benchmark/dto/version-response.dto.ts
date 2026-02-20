export class VersionResponseDto {
  id: string;
  datasetId: string;
  version: string;
  gitRevision: string;
  manifestPath: string;
  documentCount: number;
  groundTruthSchema: Record<string, unknown> | null;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  splits?: Array<{
    id: string;
    name: string;
    type: string;
    sampleCount: number;
  }>;
}
