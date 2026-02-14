export class VersionListItemDto {
  id: string;
  version: string;
  status: string;
  documentCount: number;
  gitRevision: string;
  publishedAt: Date | null;
  createdAt: Date;
}

export class VersionListResponseDto {
  versions: VersionListItemDto[];
}
