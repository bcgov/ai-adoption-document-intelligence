export class VersionResponseDto {
  id: string;
  datasetId: string;
  version: string;
  name: string | null;
  storagePrefix: string | null;
  manifestPath: string;
  documentCount: number;
  groundTruthSchema: Record<string, unknown> | null;
  frozen: boolean;
  createdAt: Date;
  splits?: Array<{
    id: string;
    name: string;
    type: string;
    sampleCount: number;
  }>;
}
