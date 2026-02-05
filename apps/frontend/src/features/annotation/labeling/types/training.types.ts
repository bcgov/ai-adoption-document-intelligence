export enum TrainingStatus {
  PENDING = "PENDING",
  UPLOADING = "UPLOADING",
  UPLOADED = "UPLOADED",
  TRAINING = "TRAINING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export interface TrainingJob {
  id: string;
  projectId: string;
  status: TrainingStatus;
  containerName: string;
  sasUrl?: string;
  blobCount: number;
  modelId?: string;
  operationId?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface TrainedModel {
  id: string;
  projectId: string;
  trainingJobId: string;
  modelId: string;
  description?: string;
  docTypes?: Record<string, unknown>;
  fieldCount: number;
  createdAt: string;
}

export interface ValidationResult {
  valid: boolean;
  labeledDocumentsCount: number;
  minimumRequired: number;
  issues: string[];
}

export interface StartTrainingRequest {
  modelId: string;
  description?: string;
}
