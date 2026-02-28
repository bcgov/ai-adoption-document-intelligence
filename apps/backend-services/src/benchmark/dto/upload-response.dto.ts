export class UploadedFileDto {
  filename: string;
  path: string;
  size: number;
  mimeType: string;
}

export class UploadVersionDto {
  id: string;
  version: string;
  gitRevision: string | null;
  documentCount: number;
}

export class UploadResponseDto {
  datasetId: string;
  uploadedFiles: UploadedFileDto[];
  manifestUpdated: boolean;
  totalFiles: number;
  version: UploadVersionDto;
}
