export enum TrainingStatus {
  PENDING = "PENDING",
  UPLOADING = "UPLOADING",
  UPLOADED = "UPLOADED",
  TRAINING = "TRAINING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export type TemplateModelStatus = "draft" | "training" | "trained" | "failed";

export interface TrainingJob {
  id: string;
  templateModelId: string;
  status: TrainingStatus;
  containerName: string;
  sasUrl?: string;
  blobCount: number;
  operationId?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface ValidationResult {
  valid: boolean;
  labeledDocumentsCount: number;
  minimumRequired: number;
  issues: string[];
}

export interface StartTrainingRequest {
  description?: string;
}
