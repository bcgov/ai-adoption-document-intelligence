import {
  type CombineSegmentResultInput,
  combineSegmentResult,
} from "./combine-segment-result";

describe("combineSegmentResult activity", () => {
  it("merges the OCR result onto the segment under `ocrResult`", async () => {
    const input: CombineSegmentResultInput = {
      currentSegment: {
        segmentIndex: 0,
        blobKey: "seg-0.pdf",
        pageRange: { start: 1, end: 2 },
        pageCount: 2,
      },
      segmentOcrResult: { documentId: "doc-1", status: "succeeded" },
    };

    const { combinedSegment } = await combineSegmentResult(input);

    expect(combinedSegment).toEqual({
      segmentIndex: 0,
      blobKey: "seg-0.pdf",
      pageRange: { start: 1, end: 2 },
      pageCount: 2,
      ocrResult: { documentId: "doc-1", status: "succeeded" },
    });
  });

  it("accepts ANY segment shape (family-tagged input) — a bare DocumentSegment", async () => {
    // The catalog port is `Segment` (family), so document.split's
    // DocumentSegment[] items must combine without carrying classification
    // fields. The activity reads no subkind-specific field.
    const { combinedSegment } = await combineSegmentResult({
      currentSegment: { segmentIndex: 3, blobKey: "seg-3.pdf" },
      segmentOcrResult: "raw-ocr-text",
    });

    expect(combinedSegment).toEqual({
      segmentIndex: 3,
      blobKey: "seg-3.pdf",
      ocrResult: "raw-ocr-text",
    });
  });

  it("accepts a LabeledSegment shape (flatten-classified chain)", async () => {
    const { combinedSegment } = await combineSegmentResult({
      currentSegment: {
        label: "invoice",
        pageRange: { start: 4, end: 5 },
        confidence: 0.92,
      },
      segmentOcrResult: null,
    });

    expect(combinedSegment).toMatchObject({
      label: "invoice",
      confidence: 0.92,
      ocrResult: null,
    });
  });

  it("does not mutate the input segment", async () => {
    const currentSegment = { segmentIndex: 1, blobKey: "seg-1.pdf" };
    await combineSegmentResult({
      currentSegment,
      segmentOcrResult: { ok: true },
    });
    expect(currentSegment).toEqual({ segmentIndex: 1, blobKey: "seg-1.pdf" });
  });
});
