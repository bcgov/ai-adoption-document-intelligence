import { DocumentStatus } from "@generated/client";
import { ApiProperty } from "@nestjs/swagger";
import { JsonValue } from "@prisma/client/runtime/client";

export class DocumentDataDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  original_filename!: string;

  @ApiProperty()
  file_path!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      "Blob key of the normalized PDF used for OCR and in-app viewing.",
  })
  normalized_file_path!: string | null;

  @ApiProperty()
  file_type!: string;

  @ApiProperty()
  file_size!: number;

  @ApiProperty({ type: Object, required: false, nullable: true })
  metadata?: JsonValue;

  @ApiProperty()
  source!: string;

  @ApiProperty({ enum: DocumentStatus })
  status!: DocumentStatus;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiProperty({ required: false, nullable: true, type: "string" })
  apim_request_id?: string | null;

  @ApiProperty()
  model_id!: string;

  @ApiProperty({ type: "string" })
  group_id!: string;
}
