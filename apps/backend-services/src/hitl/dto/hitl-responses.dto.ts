import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class QueueDocumentOcrDto {
  @ApiProperty({
    description: "Extracted key-value pairs with confidence scores",
    type: "object",
    additionalProperties: true,
  })
  fields!: Record<string, unknown>;
}

export class QueueSessionSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewer_id!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  completed_at!: Date | null;

  @ApiProperty()
  corrections_count!: number;
}

export class QueueDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  original_filename!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  model_id!: string | null;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;

  @ApiProperty({ type: QueueDocumentOcrDto })
  ocr_result!: QueueDocumentOcrDto;

  @ApiPropertyOptional({ type: QueueSessionSummaryDto })
  lastSession?: QueueSessionSummaryDto;
}

export class QueueResponseDto {
  @ApiProperty({ type: [QueueDocumentDto] })
  documents!: QueueDocumentDto[];

  @ApiProperty({ description: "Total number of documents matching the filter" })
  total!: number;
}

export class QueueStatsResponseDto {
  @ApiProperty({ description: "Total documents in the review queue" })
  totalDocuments!: number;

  @ApiProperty({ description: "Documents requiring human review" })
  requiresReview!: number;

  @ApiProperty({ description: "Average confidence score across all documents" })
  averageConfidence!: number;

  @ApiProperty({ description: "Number of documents reviewed today" })
  reviewedToday!: number;
}

export class SessionDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  original_filename!: string;

  @ApiProperty()
  storage_path!: string;

  @ApiProperty({ type: QueueDocumentOcrDto })
  ocr_result!: QueueDocumentOcrDto;
}

export class ReviewSessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  reviewerId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional()
  completedAt?: Date | null;

  @ApiProperty({ type: SessionDocumentDto })
  document!: SessionDocumentDto;

  @ApiPropertyOptional({
    description: "Corrections submitted during this session",
    type: "array",
  })
  corrections?: unknown[];

  @ApiPropertyOptional({
    description:
      "Field format definitions from the template model for client-side validation",
    type: "array",
  })
  fieldDefinitions?: Array<{ field_key: string; format_spec?: string | null }>;
}

export class CorrectionRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fieldKey!: string;

  @ApiPropertyOptional()
  originalValue?: string | null;

  @ApiPropertyOptional()
  correctedValue?: string | null;

  @ApiPropertyOptional()
  originalConfidence?: number | null;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class SubmitCorrectionsResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: "array", description: "Saved correction records" })
  corrections!: unknown[];

  @ApiProperty()
  message!: string;
}

export class CorrectionsListResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: [CorrectionRecordDto] })
  corrections!: CorrectionRecordDto[];
}

export class SessionActionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  completedAt?: Date | null;

  @ApiPropertyOptional({
    description: "Escalation reason (escalate endpoint only)",
  })
  reason?: string;

  @ApiProperty()
  message!: string;
}

export class AnalyticsCorrectionsByActionDto {
  @ApiPropertyOptional() confirmed?: number;
  @ApiPropertyOptional() corrected?: number;
  @ApiPropertyOptional() flagged?: number;
}

export class AnalyticsSummaryDto {
  @ApiProperty() totalSessions!: number;
  @ApiProperty() completedSessions!: number;
  @ApiProperty() totalCorrections!: number;
  @ApiProperty() confirmedFields!: number;
  @ApiProperty() correctedFields!: number;
  @ApiProperty() flaggedFields!: number;
}

export class AnalyticsResponseDto {
  @ApiProperty() totalDocuments!: number;
  @ApiProperty() reviewedDocuments!: number;
  @ApiProperty() averageConfidence!: number;
  @ApiProperty() correctionRate!: number;
  @ApiProperty({ type: AnalyticsCorrectionsByActionDto })
  correctionsByAction!: AnalyticsCorrectionsByActionDto;
  @ApiProperty({ type: AnalyticsSummaryDto }) summary!: AnalyticsSummaryDto;
}

export class ReopenSessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  message!: string;
}
