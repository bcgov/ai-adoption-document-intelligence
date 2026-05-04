export enum ClassifierStatus {
  PRETRAINING = "PRETRAINING",
  FAILED = "FAILED",
  TRAINING = "TRAINING",
  READY = "READY",
}

export enum ClassifierSource {
  AZURE = "AZURE",
}

/** Labels that are reserved for internal use and may not be created by users. */
export const RESERVED_CLASSIFIER_LABELS = ["other", "others"] as const;

export interface ClassifierModel {
  id: string;
  name: string;
  group_id: string;
  status: ClassifierStatus;
  source: ClassifierSource;
  group?: {
    id: string;
    name: string;
  };
  description?: string;
}
