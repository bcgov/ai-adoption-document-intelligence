export class VersionResponseDto {
  id: string;
  datasetId: string;
  version: string;
  name: string | null;
  gitRevision: string | null;
  manifestPath: string;
  documentCount: number;
  groundTruthSchema: Record<string, unknown> | null;
  createdAt: Date;
  splits?: Array<{
    id: string;
    name: string;
    type: string;
    sampleCount: number;
  }>;
}
