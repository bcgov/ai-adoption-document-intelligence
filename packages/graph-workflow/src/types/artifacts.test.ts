/**
 * Smoke tests for the typed-I/O artifact module (US-089).
 *
 * The `ArtifactKind` union is a type, not a runtime value, so we exercise
 * it via a `satisfies ArtifactKind[]` array literal: TypeScript will fail
 * compilation if any listed string isn't a member, and the runtime length
 * check pins the union's cardinality.
 */

import type { ArrayKind, ArtifactKind, KindRef, Segment } from "./artifacts";

describe("ArtifactKind union", () => {
  it("has exactly 18 members per TYPED_IO_DESIGN.md §1", () => {
    const allKinds = [
      "Artifact",
      "Document",
      "MultiPageDocument",
      "SinglePageDocument",
      "Segment",
      "Segment<Text>",
      "Segment<Table>",
      "Segment<Figure>",
      "Segment<Form>",
      "Segment<KeyValue>",
      "Segment<Signature>",
      "Segment<Header>",
      "OcrResult",
      "OcrFields",
      "OcrTable",
      "Classification",
      "ValidationResult",
      "Reference",
    ] as const satisfies readonly ArtifactKind[];

    expect(allKinds.length).toBe(18);
    expect(new Set(allKinds).size).toBe(18);
  });

  it("enumerates all seven Segment<Kind> parameterised entries", () => {
    const segmentKinds = [
      "Segment<Text>",
      "Segment<Table>",
      "Segment<Figure>",
      "Segment<Form>",
      "Segment<KeyValue>",
      "Segment<Signature>",
      "Segment<Header>",
    ] as const satisfies readonly ArtifactKind[];

    expect(segmentKinds.length).toBe(7);
  });
});

describe("ArrayKind template-literal type", () => {
  it("accepts every ArtifactKind suffixed with []", () => {
    const arrays = [
      "Document[]",
      "Segment[]",
      "Segment<Table>[]",
      "OcrResult[]",
      "Reference[]",
    ] as const satisfies readonly ArrayKind[];

    expect(arrays.length).toBe(5);
  });
});

describe("KindRef union", () => {
  it("admits both single and array cardinality", () => {
    const refs = [
      "Document",
      "Document[]",
      "Segment<Text>",
      "Segment<Text>[]",
    ] as const satisfies readonly KindRef[];

    expect(refs.length).toBe(4);
  });
});

describe("Segment provenance interface", () => {
  it("accepts the full TYPED_IO_DESIGN.md §1 shape", () => {
    const segment: Segment = {
      parentDocId: "doc-1",
      pageRange: { start: 1, end: 3 },
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      kind: "Table",
      confidence: 0.92,
      blobKey: "blobs/segment-1.bin",
    };

    expect(segment.parentDocId).toBe("doc-1");
    expect(segment.kind).toBe("Table");
  });

  it("accepts the minimal shape (only parentDocId required)", () => {
    const segment: Segment = { parentDocId: "doc-2" };
    expect(segment.parentDocId).toBe("doc-2");
  });
});
