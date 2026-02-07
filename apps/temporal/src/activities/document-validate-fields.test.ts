import {
  validateDocumentFields,
  DocumentValidateFieldsInput,
} from "./document-validate-fields";

describe("validateDocumentFields activity", () => {
  it("validates multiple fields and matches attachments", async () => {
    const input: DocumentValidateFieldsInput = {
      documentId: "doc-1",
      processedSegments: [
        {
          invoiceNumber: "INV-123",
          vendorName: "Acme Corp",
          totalAmount: "100.00",
        },
        {
          invoiceNumber: "INV-123",
          vendorName: "Acme Corp",
          totalAmount: "100.00",
        },
      ],
    };

    const result = await validateDocumentFields(input);
    const entries = result.validationResults.entries;

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.matched)).toBe(true);
    expect(result.validationResults.summary.matched).toBe(entries.length);
  });

  it("detects mismatches between primary and attachments", async () => {
    const input: DocumentValidateFieldsInput = {
      documentId: "doc-2",
      processedSegments: [
        {
          invoiceNumber: "INV-123",
          vendorName: "Acme Corp",
          totalAmount: "100.00",
        },
        {
          invoiceNumber: "INV-999",
          vendorName: "Acme Corp",
          totalAmount: "100.00",
        },
      ],
    };

    const result = await validateDocumentFields(input);
    const invoiceEntry = result.validationResults.entries.find(
      (entry) => entry.rule === "invoice-number",
    );

    expect(invoiceEntry?.matched).toBe(false);
    expect(invoiceEntry?.reason).toBe("attachment mismatch");
    expect(result.validationResults.summary.mismatched).toBeGreaterThan(0);
  });

  it("reports missing fields on primary or attachments", async () => {
    const input: DocumentValidateFieldsInput = {
      documentId: "doc-3",
      processedSegments: [
        {
          vendorName: "Acme Corp",
        },
        {
          vendorName: "Acme Corp",
        },
      ],
      rules: [
        {
          name: "invoice-number",
          primaryField: "invoiceNumber",
          attachmentField: "invoiceNumber",
        },
      ],
    };

    const result = await validateDocumentFields(input);
    const entry = result.validationResults.entries[0];

    expect(entry.matched).toBe(false);
    expect(entry.reason).toBe("missing primary field");
    expect(result.validationResults.summary.missing).toBe(1);
  });

  it("returns output for downstream storage", async () => {
    const input: DocumentValidateFieldsInput = {
      documentId: "doc-4",
      processedSegments: [
        {
          invoiceNumber: "INV-123",
        },
      ],
      rules: [
        {
          name: "invoice-number",
          primaryField: "invoiceNumber",
          attachmentField: "invoiceNumber",
        },
      ],
    };

    const result = await validateDocumentFields(input);
    expect(result.validationResults.documentId).toBe("doc-4");
    expect(result.validationResults.entries).toHaveLength(1);
  });
});
