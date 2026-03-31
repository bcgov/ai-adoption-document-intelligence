import { ApiProperty } from "@nestjs/swagger";
import {
  LabelingDocumentResponseDto,
  LabeledDocumentResponseDto,
} from "./labeling-responses.dto";

/** Response body for HTTP 422 when the original blob was stored but normalization to PDF failed. */
export class LabelingConversionFailedResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: "conversion_failed" })
  code: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: LabeledDocumentResponseDto })
  labeledDocument: LabeledDocumentResponseDto;

  @ApiProperty({ type: LabelingDocumentResponseDto })
  labelingDocument: LabelingDocumentResponseDto;
}
