export class SplitListItemDto {
  id: string;
  name: string;
  type: string;
  sampleCount: number;
}

export class VersionListItemDto {
  id: string;
  version: string;
  name: string | null;
  documentCount: number;
  storagePrefix: string | null;
  frozen: boolean;
  createdAt: Date;
  splits?: SplitListItemDto[];
}

export class VersionListResponseDto {
  versions: VersionListItemDto[];
}
