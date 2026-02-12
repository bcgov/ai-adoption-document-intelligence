import {
  validateDocumentFields,
  DocumentValidateFieldsInput,
} from "./document-validate-fields";

describe("validateDocumentFields activity", () => {
  describe("field-match validation", () => {
    it("validates text fields with exact matching", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-1",
        processedSegments: [
          {
            invoiceNumber: "INV-123",
            vendorName: "Acme Corp",
          },
          {
            invoiceNumber: "INV-123",
            vendorName: "Acme Corp",
          },
        ],
        rules: [
          {
            name: "invoice-number",
            type: "field-match",
            primaryField: "invoiceNumber",
            attachmentField: "invoiceNumber",
          },
          {
            name: "vendor-name",
            type: "field-match",
            primaryField: "vendorName",
            attachmentField: "vendorName",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entries = result.validationResults.entries;

      expect(entries).toHaveLength(2);
      expect(entries.every((entry) => entry.matched)).toBe(true);
      expect(result.validationResults.summary.matched).toBe(2);
    });

    it("extracts key-value pairs from combined segments for validation", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-12",
        processedSegments: [
          {
            combinedSegment: {
              segmentIndex: 1,
              ocrResult: {
                keyValuePairs: [
                  {
                    key: { content: "Gross pay:" },
                    value: { content: "1,260.00" },
                  },
                  {
                    key: { content: "o Gross pay:" },
                    value: { content: "1,344.00" },
                  },
                  {
                    key: { content: "Net pay (deposit):" },
                    value: { content: "1,003.42" },
                  },
                  {
                    key: { content: "o Net pay (deposit):" },
                    value: { content: "999.99" },
                  },
                  {
                    key: { content: "Total other income:" },
                    value: { content: "250.00" },
                  },
                ],
              },
            },
          },
          {
            combinedSegment: {
              segmentIndex: 2,
              ocrResult: {
                keyValuePairs: [
                  {
                    key: { content: "Gross pay:" },
                    value: { content: "1,260.00" },
                  },
                  {
                    key: { content: "Total deductions:" },
                    value: { content: "256.58" },
                  },
                  {
                    key: { content: "Net pay (direct deposit):" },
                    value: { content: "1,003.42" },
                  },
                ],
              },
            },
          },
          {
            combinedSegment: {
              segmentIndex: 3,
              ocrResult: {
                keyValuePairs: [
                  {
                    key: { content: "Amount" },
                    value: { content: "+250.00\n+1,003.42" },
                  },
                ],
              },
            },
          },
        ],
        rules: [
          {
            name: "gross-pay-match",
            type: "field-match",
            primaryField: "page1.grossPay",
            attachmentField: "page2.grossPay",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
          {
            name: "deposits-match",
            type: "array-match",
            primaryFields: ["page1.netPay", "page1.totalOtherIncome"],
            attachmentFields: ["page3.amount"],
            matchType: "all",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
          {
            name: "pay-stub-arithmetic",
            type: "arithmetic",
            expression: {
              operation: "difference",
              fields: ["page2.grossPay", "page2.totalDeductions"],
              equals: "page2.netPay",
            },
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const [grossPayMatch, depositsMatch, arithmeticMatch] =
        result.validationResults.entries;

      expect(grossPayMatch.matched).toBe(true);
      expect(depositsMatch.matched).toBe(true);
      expect(arithmeticMatch.matched).toBe(true);
    });

    it("keeps checkbox key when no non-checkbox value exists", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-13",
        processedSegments: [
          {
            combinedSegment: {
              segmentIndex: 1,
              ocrResult: {
                keyValuePairs: [
                  {
                    key: { content: "o Net pay (deposit):" },
                    value: { content: "1,003.42" },
                  },
                ],
              },
            },
          },
          {
            combinedSegment: {
              segmentIndex: 2,
              ocrResult: {
                keyValuePairs: [
                  {
                    key: { content: "o Net pay (deposit):" },
                    value: { content: "1,003.42" },
                  },
                ],
              },
            },
          },
        ],
        rules: [
          {
            name: "net-pay-match",
            type: "field-match",
            primaryField: "page1.netPay",
            attachmentField: "page2.netPay",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
      expect(entry.primaryValue).toBe(1003.42);
    });

    it("validates currency fields with tolerance", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-2",
        processedSegments: [
          {
            amount: "$1,234.56",
          },
          {
            amount: "1234.57",
          },
        ],
        rules: [
          {
            name: "amount-tolerance",
            type: "field-match",
            primaryField: "amount",
            attachmentField: "amount",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
      expect(entry.matchType).toBe("within-tolerance");
      expect(entry.details?.actualDelta).toBeLessThanOrEqual(0.05);
    });

    it("detects mismatches between primary and attachments", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-3",
        processedSegments: [
          {
            invoiceNumber: "INV-123",
          },
          {
            invoiceNumber: "INV-999",
          },
        ],
        rules: [
          {
            name: "invoice-number",
            type: "field-match",
            primaryField: "invoiceNumber",
            attachmentField: "invoiceNumber",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(false);
      expect(entry.reason).toBe("attachment mismatch");
      expect(result.validationResults.summary.mismatched).toBe(1);
    });

    it("reports missing fields", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-4",
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
            type: "field-match",
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
  });

  describe("arithmetic validation", () => {
    it("validates sum arithmetic", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-5",
        processedSegments: [
          {
            item1: 100,
            item2: 200,
            total: 300,
          },
        ],
        rules: [
          {
            name: "sum-validation",
            type: "arithmetic",
            expression: {
              operation: "sum",
              fields: ["item1", "item2"],
              equals: "total",
            },
            operator: "equals",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
      expect(entry.primaryValue).toBe(300);
      expect(entry.attachmentValues).toEqual([300]);
    });

    it("validates difference arithmetic with tolerance", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-6",
        processedSegments: [
          {
            grossPay: 1000,
            deductions: 200.01,
            netPay: 800,
          },
        ],
        rules: [
          {
            name: "net-pay-calculation",
            type: "arithmetic",
            expression: {
              operation: "difference",
              fields: ["grossPay", "deductions"],
              equals: "netPay",
            },
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
      expect(entry.matchType).toBe("within-tolerance");
    });

    it("detects arithmetic mismatches", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-7",
        processedSegments: [
          {
            grossPay: 1000,
            deductions: 100,
            netPay: 950,
          },
        ],
        rules: [
          {
            name: "net-pay-calculation",
            type: "arithmetic",
            expression: {
              operation: "difference",
              fields: ["grossPay", "deductions"],
              equals: "netPay",
            },
            operator: "equals",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(false);
      expect(entry.reason).toContain("does not match expected");
    });
  });

  describe("array-match validation", () => {
    it("validates array matching with all match type", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-8",
        processedSegments: [
          {
            netPay: 800,
            otherIncome: 100,
          },
          {
            deposit1: 800,
            deposit2: 100,
            deposit3: 50,
          },
        ],
        rules: [
          {
            name: "deposits-match",
            type: "array-match",
            primaryFields: ["netPay", "otherIncome"],
            attachmentFields: ["deposit1", "deposit2", "deposit3"],
            matchType: "all",
            operator: "equals",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
      expect(entry.matchType).toBe("partial");
    });

    it("validates array matching with tolerance", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-9",
        processedSegments: [
          {
            netPay: 800.00,
            otherIncome: 100.00,
          },
          {
            deposits: [800.02, 100.01, 50],
          },
        ],
        rules: [
          {
            name: "deposits-tolerance",
            type: "array-match",
            primaryFields: ["netPay", "otherIncome"],
            attachmentFields: ["deposits"],
            matchType: "all",
            operator: "approximately",
            tolerance: { amount: 0.05 },
            fieldType: "currency",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
    });

    it("detects partial array matches with any match type", async () => {
      const input: DocumentValidateFieldsInput = {
        documentId: "doc-10",
        processedSegments: [
          {
            value1: 100,
            value2: 999,
          },
          {
            values: [100, 200, 300],
          },
        ],
        rules: [
          {
            name: "partial-match",
            type: "array-match",
            primaryFields: ["value1", "value2"],
            attachmentFields: ["values"],
            matchType: "any",
            operator: "equals",
          },
        ],
      };

      const result = await validateDocumentFields(input);
      const entry = result.validationResults.entries[0];

      expect(entry.matched).toBe(true);
      expect(entry.matchType).toBe("partial");
      // When matched is true with matchType 'any', 1 value matched out of 2
      expect(entry.primaryValue).toBe(100);
    });
  });

  it("returns proper output structure for downstream storage", async () => {
    const input: DocumentValidateFieldsInput = {
      documentId: "doc-11",
      processedSegments: [
        {
          invoiceNumber: "INV-123",
        },
      ],
      rules: [
        {
          name: "invoice-number",
          type: "field-match",
          primaryField: "invoiceNumber",
          attachmentField: "invoiceNumber",
        },
      ],
    };

    const result = await validateDocumentFields(input);
    expect(result.validationResults.documentId).toBe("doc-11");
    expect(result.validationResults.entries).toHaveLength(1);
    expect(result.validationResults.summary).toHaveProperty("matched");
    expect(result.validationResults.summary).toHaveProperty("mismatched");
    expect(result.validationResults.summary).toHaveProperty("missing");
  });
});
