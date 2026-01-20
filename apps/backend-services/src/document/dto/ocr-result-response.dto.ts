import { ApiProperty } from "@nestjs/swagger";
import { OcrResultDto } from "@/document/dto/ocr-result.dto";
import { DocumentStatus } from "@/generated/enums";

export class OcrResultResponseDto {
  @ApiProperty()
  document_id: string;

  @ApiProperty({ enum: DocumentStatus })
  status: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  original_filename: string;

  @ApiProperty()
  file_type: string;

  @ApiProperty()
  file_size: number;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({ required: false, nullable: true, type: "string" })
  apim_request_id?: string | null;

  @ApiProperty()
  model_id: string;

  @ApiProperty({ type: OcrResultDto, nullable: true })
  ocr_result: OcrResultDto | null;
}
