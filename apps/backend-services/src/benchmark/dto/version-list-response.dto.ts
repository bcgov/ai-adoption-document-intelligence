export class SplitListItemDto {
  id: string;
  name: string;
  type: string;
  sampleCount: number;
}

export class VersionListItemDto {
  id: string;
  version: string;
  status: string;
  documentCount: number;
  gitRevision: string;
  publishedAt: Date | null;
  createdAt: Date;
  splits?: SplitListItemDto[];
}

export class VersionListResponseDto {
  versions: VersionListItemDto[];
}
