export enum TrainingStatus {
  PENDING = "PENDING",
  UPLOADING = "UPLOADING",
  UPLOADED = "UPLOADED",
  TRAINING = "TRAINING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export enum BuildMode {
  template = "template",
  neural = "neural",
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
  buildMode: BuildMode;
  maxTrainingHours?: number;
}

export interface ValidationResult {
  valid: boolean;
  labeledDocumentsCount: number;
  minimumRequired: number;
  issues: string[];
}

export interface StartTrainingRequest {
  description?: string;
  buildMode?: BuildMode;
  maxTrainingHours?: number;
}

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
  buildMode: BuildMode;
  maxTrainingHours?: number;
  actualTrainingHours?: number;
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

export interface TrainingInfo {
  region?: string;
  customNeuralDocumentModelBuilds?: {
    used: number;
    quota: number;
    quotaResetDateTime: string;
  };
  raw?: Record<string, unknown>;
}
