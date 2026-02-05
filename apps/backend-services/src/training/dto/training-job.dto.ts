import { TrainingStatus } from "@generated/client";

export class TrainingJobDto {
  id: string;
  projectId: string;
  status: TrainingStatus;
  containerName: string;
  sasUrl?: string;
  blobCount: number;
  modelId?: string;
  operationId?: string;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
}

export class ValidationResultDto {
  valid: boolean;
  labeledDocumentsCount: number;
  minimumRequired: number;
  issues: string[];
}
