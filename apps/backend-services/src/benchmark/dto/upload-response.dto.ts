import { ApiProperty } from "@nestjs/swagger";

export class UploadedFileDto {
  @ApiProperty({ description: "Uploaded filename" })
  filename: string;

  @ApiProperty({ description: "Storage path of the uploaded file" })
  path: string;

  @ApiProperty({ description: "File size in bytes" })
  size: number;

  @ApiProperty({ description: "MIME type of the uploaded file" })
  mimeType: string;
}

export class UploadVersionDto {
  @ApiProperty({ description: "Dataset version ID" })
  id: string;

  @ApiProperty({ description: "Version label" })
  version: string;

  @ApiProperty({
    description: "Storage prefix for this version",
    nullable: true,
  })
  storagePrefix: string | null;

  @ApiProperty({ description: "Number of documents in this version" })
  documentCount: number;
}

export class UploadResponseDto {
  @ApiProperty({ description: "Dataset ID" })
  datasetId: string;

  @ApiProperty({
    description: "List of uploaded files",
    type: () => UploadedFileDto,
    isArray: true,
  })
  uploadedFiles: UploadedFileDto[];

  @ApiProperty({ description: "Whether the dataset manifest was updated" })
  manifestUpdated: boolean;

  @ApiProperty({ description: "Total number of files uploaded" })
  totalFiles: number;

  @ApiProperty({
    description: "Version info for the upload",
    type: () => UploadVersionDto,
  })
  version: UploadVersionDto;
}
