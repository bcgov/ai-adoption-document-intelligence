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

/**
 * One trained version of a template model. Each retrain produces a new row;
 * `version` is the sequential version number, `isActive` flags the version
 * resolved by OCR/benchmarks against the bare template model_id, and
 * `deletedAt` is set on tombstoned versions.
 */
export interface TrainedModelVersion {
  id: string;
  templateModelId: string;
  trainingJobId: string;
  modelId: string;
  version: number;
  isActive: boolean;
  deletedAt?: string;
  description?: string;
  docTypes?: Record<string, unknown>;
  fieldCount: number;
  createdAt: string;
}

export interface TrainedModelSnapshotLabel {
  fieldKey: string;
  labelName: string;
  value: string | null;
  pageNumber: number;
  boundingBox: unknown;
}

export interface TrainedModelSnapshotDocument {
  labelingDocumentId: string;
  originalFilename: string;
  labels: TrainedModelSnapshotLabel[];
}

export interface TrainedModelSnapshot {
  documents: TrainedModelSnapshotDocument[];
}
