export class DatasetResponseDto {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  repositoryUrl: string;
  dvcRemote: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  versionCount?: number;
  recentVersions?: Array<{
    id: string;
    version: string;
    status: string;
    documentCount: number;
    createdAt: Date;
  }>;
}
