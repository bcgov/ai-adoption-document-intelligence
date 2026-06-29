import { ApiProperty } from "@nestjs/swagger";

/** Subset of document fields returned when upload succeeds in storing the original but PDF normalization fails. */
export class UploadConversionFailedDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  original_filename!: string;

  @ApiProperty({ nullable: true })
  normalized_file_path!: string | null;

  @ApiProperty()
  file_type!: string;

  @ApiProperty()
  file_size!: number;

  @ApiProperty({ description: "Typically conversion_failed" })
  status!: string;

  @ApiProperty()
  created_at!: Date;
}

/** Response body for HTTP 422 when the original blob was stored but normalization to PDF failed. */
export class UploadConversionFailedResponseDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    description:
      "Machine-readable failure reason. `conversion_failed` for a generic normalization failure, or a specific code such as `password_protected` when the cause is known.",
    example: "password_protected",
  })
  code!: string;

  @ApiProperty({
    description: "Human-readable reason for the failure.",
    example:
      "The PDF is password protected and cannot be processed. Upload an unlocked copy.",
  })
  message!: string;

  @ApiProperty({ type: UploadConversionFailedDocumentDto })
  document!: UploadConversionFailedDocumentDto;
}
