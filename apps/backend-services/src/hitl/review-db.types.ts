import type {
  Document,
  FieldCorrection,
  OcrResult,
  ReviewSession,
} from "@generated/client";

export type ReviewSessionData = ReviewSession & {
  document: Document & {
    ocr_result: OcrResult | null;
  };
  corrections: FieldCorrection[];
};
