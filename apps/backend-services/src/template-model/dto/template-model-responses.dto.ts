import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class FieldDefinitionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() template_model_id: string;
  @ApiProperty() field_key: string;
  @ApiProperty() field_type: string;
  @ApiPropertyOptional() field_format?: string | null;
  @ApiProperty() display_order: number;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class TemplateModelResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() model_id: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() status: string;
  @ApiProperty() created_by: string;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
  @ApiProperty() group_id: string;
  @ApiProperty({ type: [FieldDefinitionResponseDto] })
  field_schema: FieldDefinitionResponseDto[];
  @ApiPropertyOptional({ type: "array" })
  documents?: unknown[];
}

export class LabelingDocumentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() original_filename: string;
  @ApiProperty() file_path: string;
  @ApiProperty() file_type: string;
  @ApiProperty() file_size: number;
  @ApiProperty() source: string;
  @ApiProperty() status: string;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  ocr_result?: unknown;
}

export class LabelResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() labeled_document_id: string;
  @ApiProperty() field_key: string;
  @ApiProperty() label_name: string;
  @ApiPropertyOptional() value?: string | null;
  @ApiProperty() page_number: number;
  @ApiProperty({ type: "object", additionalProperties: true })
  bounding_box: unknown;
  @ApiProperty() created_at: Date;
}

export class LabeledDocumentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() template_model_id: string;
  @ApiProperty() labeling_document_id: string;
  @ApiProperty() status: string;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
  @ApiProperty({ type: LabelingDocumentResponseDto })
  labeling_document: LabelingDocumentResponseDto;
  @ApiProperty({ type: [LabelResponseDto] }) labels: LabelResponseDto[];
}

export class DeleteResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() id: string;
}

export class DeleteDocumentResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() documentId: string;
}

export class UploadLabelingResponseDto {
  @ApiProperty({ type: LabeledDocumentResponseDto })
  labeledDocument: LabeledDocumentResponseDto;
  @ApiProperty({ type: LabelingDocumentResponseDto })
  labelingDocument: LabelingDocumentResponseDto;
}

export class ExportFieldDto {
  @ApiProperty() fieldKey: string;
  @ApiProperty() fieldType: string;
  @ApiPropertyOptional() fieldFormat?: string;
}

export class ExportLabelValueDto {
  @ApiProperty() page: number;
  @ApiProperty() text: string;
  @ApiProperty({ type: "array", items: { type: "number" } })
  boundingBoxes: number[][];
}

export class ExportLabelEntryDto {
  @ApiProperty() label: string;
  @ApiProperty({ type: [ExportLabelValueDto] }) value: ExportLabelValueDto[];
}

export class ExportLabelsFileDto {
  @ApiProperty() filename: string;
  @ApiProperty({ type: "object", additionalProperties: true }) content: unknown;
}

export class AzureExportResponseDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  fieldsJson: unknown;
  @ApiProperty({ type: [ExportLabelsFileDto] })
  labelsFiles: ExportLabelsFileDto[];
  @ApiProperty() templateModelName: string;
  @ApiProperty() documentCount: number;
  @ApiProperty() labeledCount: number;
}

export class JsonExportDocumentDto {
  @ApiProperty() id: string;
  @ApiProperty() filename: string;
  @ApiProperty() status: string;
  @ApiProperty({ type: "array" }) labels: unknown[];
}

export class JsonExportTemplateModelDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() created_at: Date;
  @ApiProperty({ type: "array" }) fieldSchema: unknown[];
}

export class JsonExportResponseDto {
  @ApiProperty({ type: JsonExportTemplateModelDto })
  templateModel: JsonExportTemplateModelDto;
  @ApiProperty({ type: [JsonExportDocumentDto] })
  documents: JsonExportDocumentDto[];
  @ApiProperty() exportedAt: string;
}
