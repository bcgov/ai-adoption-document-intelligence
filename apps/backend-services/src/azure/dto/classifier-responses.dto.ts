import { ApiProperty } from "@nestjs/swagger";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";

export class UploadClassifierDocumentsResponseDto {
  @ApiProperty({ example: "Received files and data." })
  message: string;

  @ApiProperty({ example: 2 })
  fileCount: number;

  @ApiProperty({ example: ["groupId/classifierName/file.jpg"] })
  results: string[];
}

export class DeleteClassifierDocumentsResponseDto {}

export class ClassifierResponseDto {
  @ApiProperty({ example: "Classification complete" })
  status: string;

  @ApiProperty({ example: "result content" })
  content: string;

  @ApiProperty({ required: false })
  error?: unknown;
}

export class ClassifierModelResponseDto {
  @ApiProperty({ example: "Classifier description" })
  description: string;

  @ApiProperty({ enum: ClassifierStatus, example: ClassifierStatus.READY })
  status: ClassifierStatus;

  @ApiProperty({ example: "classifier-name" })
  name: string;

  @ApiProperty({ example: "user-id" })
  created_by: string;

  @ApiProperty({ example: "user-id" })
  updated_by: string;

  @ApiProperty({ example: "group-id" })
  group_id: string;

  @ApiProperty({ type: Object, example: { labels: [] } })
  config: unknown;

  @ApiProperty({ type: Date })
  created_at: Date;

  @ApiProperty({ type: Date })
  updated_at: Date;

  @ApiProperty({ type: Date, nullable: true })
  last_used_at?: Date;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ enum: ClassifierSource })
  source: ClassifierSource;

  @ApiProperty({ type: String, nullable: true })
  operation_location?: string;
}
