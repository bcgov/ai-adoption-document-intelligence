import { isOcrPayloadRef, makeOcrPayloadRef } from "./ocr-payload-ref";

describe("ocr-payload-ref", () => {
  it("isOcrPayloadRef identifies blob refs", () => {
    expect(
      isOcrPayloadRef(
        makeOcrPayloadRef("doc-1", "g1/ocr/doc-1/ocr-result.json", "succeeded"),
      ),
    ).toBe(true);
    expect(isOcrPayloadRef({ foo: "bar" })).toBe(false);
  });
});
