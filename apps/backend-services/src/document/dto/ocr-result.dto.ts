import { ApiProperty } from "@nestjs/swagger";
import { JsonValue } from "@prisma/client/runtime/client";

export class OcrResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  document_id!: string;

  @ApiProperty({ type: Object, required: false, nullable: true })
  keyValuePairs?: JsonValue;

  @ApiProperty({
    type: Object,
    required: false,
    nullable: true,
    description:
      'Structured OCR output. Shape: { format: "text"|"markdown", text: string, markdown?: string, pages: [{ pageNumber, content, lines }] }. Populated for prebuilt read/layout/document models.',
  })
  content?: JsonValue;

  @ApiProperty()
  processed_at!: Date;
}
