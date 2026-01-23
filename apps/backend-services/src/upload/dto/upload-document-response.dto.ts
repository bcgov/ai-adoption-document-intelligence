import { ApiProperty } from "@nestjs/swagger";

export class UploadDocumentResponseDocumentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  original_filename: string;

  @ApiProperty()
  file_type: string;

  @ApiProperty()
  file_size: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  created_at: Date;
}

export class UploadDocumentResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: UploadDocumentResponseDocumentDto })
  document: UploadDocumentResponseDocumentDto;
}
