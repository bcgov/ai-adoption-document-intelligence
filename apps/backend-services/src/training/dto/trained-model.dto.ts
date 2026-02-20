import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TrainedModelDto {
  @ApiProperty({ description: "Trained model record ID" })
  id: string;

  @ApiProperty({ description: "Labeling project ID" })
  projectId: string;

  @ApiProperty({ description: "Training job that produced this model" })
  trainingJobId: string;

  @ApiProperty({ description: "Azure Document Intelligence model ID" })
  modelId: string;

  @ApiPropertyOptional({ description: "Model description" })
  description?: string;

  @ApiPropertyOptional({ description: "Azure document type definitions", type: "object", additionalProperties: true })
  docTypes?: Record<string, unknown>;

  @ApiProperty({ description: "Number of fields the model recognizes" })
  fieldCount: number;

  @ApiProperty({ description: "When the model was created" })
  createdAt: Date;
}
