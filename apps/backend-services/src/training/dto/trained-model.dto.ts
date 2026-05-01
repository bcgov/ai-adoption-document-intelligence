import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TrainedModelDto {
  @ApiProperty({ description: "Trained model record ID" })
  id!: string;

  @ApiProperty({ description: "Template model ID" })
  templateModelId!: string;

  @ApiProperty({ description: "Training job that produced this model" })
  trainingJobId!: string;

  @ApiProperty({ description: "Azure Document Intelligence model ID" })
  modelId!: string;

  @ApiProperty({
    description: "Sequential version number within the template (1-based)",
  })
  version!: number;

  @ApiProperty({
    description: "Whether this version is currently the active one",
  })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: "When this version was tombstoned, if applicable",
  })
  deletedAt?: Date;

  @ApiPropertyOptional({ description: "Model description" })
  description?: string;

  @ApiPropertyOptional({
    description: "Azure document type definitions",
    type: "object",
    additionalProperties: true,
  })
  docTypes?: Record<string, unknown>;

  @ApiProperty({ description: "Number of fields the model recognizes" })
  fieldCount!: number;

  @ApiProperty({ description: "When the model was created" })
  createdAt!: Date;
}

/**
 * Per-document slice of the dataset snapshot stored on a TrainedModel.
 */
export class TrainedModelSnapshotDocumentDto {
  @ApiProperty()
  labelingDocumentId!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty({
    description: "Labels as they were at training time",
    type: "array",
    items: { type: "object", additionalProperties: true },
  })
  labels!: Array<{
    fieldKey: string;
    labelName: string;
    value: string | null;
    pageNumber: number;
    boundingBox: unknown;
  }>;
}

export class TrainedModelSnapshotDto {
  @ApiProperty({ type: [TrainedModelSnapshotDocumentDto] })
  documents!: TrainedModelSnapshotDocumentDto[];
}
