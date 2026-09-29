import { getSampleDocument, listSampleDocuments } from "./sample-documents";

describe("sample-documents", () => {
  it("lists the bundled samples from the manifest", () => {
    const docs = listSampleDocuments();
    const ids = docs.map((d) => d.id).sort();
    expect(ids).toEqual(["multi-page-sample", "sample-invoice"]);
    const invoice = docs.find((d) => d.id === "sample-invoice");
    expect(invoice?.mimeType).toBe("application/pdf");
    expect(invoice?.description.length).toBeGreaterThan(0);
  });

  it("reads a sample's bytes by id", () => {
    const doc = getSampleDocument("sample-invoice");
    expect(doc).not.toBeNull();
    expect(doc?.filename).toBe("sample-invoice.pdf");
    // A real PDF starts with the %PDF- magic bytes.
    expect(doc?.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("returns null for an unknown id", () => {
    expect(getSampleDocument("nope")).toBeNull();
  });
});
