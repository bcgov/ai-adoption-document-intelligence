import {
  buildSharedBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";

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

/**
 * Label name used for the automatically-injected "other" doc type during
 * classifier training.
 */
export const CLASSIFIER_OTHER_LABEL = "other";

/**
 * Blob prefix in Azure storage for the shared "other" training documents.
 * Files placed here are automatically included as the "other" label for every
 * classifier that is trained.
 */
export const CLASSIFIER_OTHER_AZURE_PREFIX = buildSharedBlobPrefixPath(
  OperationCategory.CLASSIFICATION,
  ["other"],
);
