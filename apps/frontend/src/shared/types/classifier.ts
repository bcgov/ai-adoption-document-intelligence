export enum ClassifierStatus {
  PRETRAINING = "PRETRAINING",
  FAILED = "FAILED",
  TRAINING = "TRAINING",
  READY = "READY",
}

export enum ClassifierSource {
  AZURE = "AZURE",
}

export interface ClassifierModel {
  id: string;
  name: string;
  status: ClassifierStatus;
  source: ClassifierSource;
  group?: string;
  description?: string;
}