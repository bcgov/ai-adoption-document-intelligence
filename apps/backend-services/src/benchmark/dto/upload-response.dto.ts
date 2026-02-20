export class UploadedFileDto {
  filename: string;
  path: string;
  size: number;
  mimeType: string;
}

export class UploadResponseDto {
  datasetId: string;
  uploadedFiles: UploadedFileDto[];
  manifestUpdated: boolean;
  totalFiles: number;
}
