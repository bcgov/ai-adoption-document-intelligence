export class DatasetResponseDto {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  storagePath: string;
  createdBy: string;
  groupId: string;
  createdAt: Date;
  updatedAt: Date;
  versionCount?: number;
  recentVersions?: Array<{
    id: string;
    version: string;
    documentCount: number;
    createdAt: Date;
  }>;
}
