export enum TrainingStatus {
  PENDING = "PENDING",
  UPLOADING = "UPLOADING",
  UPLOADED = "UPLOADED",
  TRAINING = "TRAINING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export type TemplateModelStatus = "draft" | "training" | "trained" | "failed";

export interface TemplateModel {
  id: string;
  name: string;
  model_id: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: TemplateModelStatus;
  groupId: string;
  fieldSchema: FieldSchema[];
  documents: TemplateModelDocument[];
}

export interface FieldSchema {
  id: string;
  [key: string]: unknown;
}

export interface TemplateModelDocument {
  id: string;
  [key: string]: unknown;
}

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

export interface TrainedModel {
  id: string;
  templateModelId: string;
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
  description?: string;
}
