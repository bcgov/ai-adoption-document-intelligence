import { ApiProperty } from "@nestjs/swagger";
import { JsonValue } from "@prisma/client/runtime/client";

export class OcrResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  document_id!: string;

  @ApiProperty({ type: Object, required: false, nullable: true })
  keyValuePairs?: JsonValue;

  @ApiProperty()
  processed_at!: Date;
}
