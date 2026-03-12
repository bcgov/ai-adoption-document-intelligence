import { BoundingBox } from "./canvas";
import { FieldType } from "./field";

export interface DocumentMetadata {
  id: string;
  filename: string;
  pageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageInfo {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
}

export interface OCRWord {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}

export interface OCRLine {
  text: string;
  boundingBox: BoundingBox;
  words: OCRWord[];
}

export interface OCRField {
  fieldKey: string;
  value: string;
  confidence: number;
  boundingBox: BoundingBox;
  pageNumber: number;
  type: FieldType;
}

export interface OCRResult {
  documentId: string;
  modelId?: string;
  fields: Record<string, OCRField>;
  pages: Array<{
    pageNumber: number;
    lines: OCRLine[];
  }>;
}

export enum AnnotationStatus {
  UNLABELED = "unlabeled",
  IN_PROGRESS = "in_progress",
  LABELED = "labeled",
}

export interface AnnotationSession {
  documentId: string;
  projectId?: string;
  sessionId?: string;
  status: AnnotationStatus;
  startedAt: Date;
  lastSavedAt?: Date;
}

export enum CorrectionAction {
  CONFIRMED = "confirmed",
  CORRECTED = "corrected",
  FLAGGED = "flagged",
  DELETED = "deleted",
}

export interface FieldCorrection {
  fieldKey: string;
  originalValue?: string;
  correctedValue?: string;
  originalConfidence?: number;
  action: CorrectionAction;
}
