import type {
  DatasetGroundTruthJob,
  DatasetVersion,
  Document,
  FieldCorrection,
  OcrResult,
  ReviewSession,
} from "@generated/client";

export type ReviewSessionData = ReviewSession & {
  document: Document & {
    ocr_result: OcrResult | null;
    groundTruthJob?:
      | (DatasetGroundTruthJob & {
          datasetVersion: Pick<DatasetVersion, "frozen">;
        })
      | null;
  };
  corrections: FieldCorrection[];
};
