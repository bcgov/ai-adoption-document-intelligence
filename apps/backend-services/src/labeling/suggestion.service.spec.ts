import { FieldType } from "@generated/client";
import { SuggestionService } from "./suggestion.service";

describe("SuggestionService", () => {
  let service: SuggestionService;

  beforeEach(() => {
    service = new SuggestionService();
  });

  it("maps selection marks by schema order", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [],
              selectionMarks: [
                {
                  state: "selected",
                  polygon: [10, 10, 20, 10, 20, 20, 10, 20],
                  confidence: 0.9,
                  span: { offset: 1, length: 1 },
                },
                {
                  state: "unselected",
                  polygon: [30, 10, 40, 10, 40, 20, 30, 20],
                  confidence: 0.9,
                  span: { offset: 2, length: 1 },
                },
              ],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "checkbox_a",
          field_type: FieldType.selectionMark,
          field_format: null,
          display_order: 0,
        },
        {
          id: "f2",
          project_id: "p1",
          field_key: "checkbox_b",
          field_type: FieldType.selectionMark,
          field_format: null,
          display_order: 1,
        },
      ],
    );

    expect(suggestions.find((s) => s.field_key === "checkbox_a")?.value).toBe(
      "selected",
    );
    expect(suggestions.find((s) => s.field_key === "checkbox_b")?.value).toBe(
      "unselected",
    );
  });

  it("respects configured selectionOrder mapping", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [],
              selectionMarks: [
                {
                  state: "selected",
                  polygon: [10, 10, 20, 10, 20, 20, 10, 20],
                  confidence: 0.9,
                  span: { offset: 1, length: 1 },
                },
                {
                  state: "unselected",
                  polygon: [30, 10, 40, 10, 40, 20, 30, 20],
                  confidence: 0.9,
                  span: { offset: 2, length: 1 },
                },
              ],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "checkbox_a",
          field_type: FieldType.selectionMark,
          field_format: null,
          display_order: 0,
        },
      ],
      {
        version: 1,
        rules: [
          {
            fieldKey: "checkbox_a",
            sourceType: "selectionMarkOrder",
            selectionOrder: 1,
          },
        ],
      },
    );

    expect(suggestions[0].value).toBe("unselected");
  });

  it("maps table cells onto page words for numeric fields", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "$",
                  polygon: [500, 300, 510, 300, 510, 320, 500, 320],
                  confidence: 0.99,
                  span: { offset: 10, length: 1 },
                },
                {
                  content: "0",
                  polygon: [512, 300, 525, 300, 525, 320, 512, 320],
                  confidence: 0.99,
                  span: { offset: 11, length: 1 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [
            {
              rowCount: 3,
              columnCount: 3,
              boundingRegions: [],
              spans: [],
              cells: [
                {
                  rowIndex: 1,
                  columnIndex: 1,
                  content: "Applicant",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [450, 240, 560, 240, 560, 270, 450, 270],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 2,
                  columnIndex: 0,
                  content: "Net Employment Income",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [300, 290, 450, 290, 450, 330, 300, 330],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 2,
                  columnIndex: 1,
                  content: "$ 0",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [495, 295, 530, 295, 530, 325, 495, 325],
                    },
                  ],
                  spans: [{ offset: 20, length: 3 }],
                  elements: [],
                },
              ],
            },
          ],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "applicant_net_employment_income",
          field_type: FieldType.number,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    const suggestion = suggestions.find(
      (s) => s.field_key === "applicant_net_employment_income",
    );
    expect(suggestion).toBeDefined();
    expect(suggestion?.element_ids.length).toBeGreaterThan(0);
    expect(suggestion?.source_type).toBe("tableCellToWords");
    expect(suggestion?.value).toBe("0");
    expect(suggestion?.value).not.toContain("$");
  });

  it("matches all value words by span when KVP value has spans (e.g. explain_changes)", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "Explain:\nLine one text.\nLine two text.",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "Line",
                  polygon: [10, 10, 40, 10, 40, 20, 10, 20],
                  confidence: 0.9,
                  span: { offset: 8, length: 4 },
                },
                {
                  content: "one",
                  polygon: [42, 10, 65, 10, 65, 20, 42, 20],
                  confidence: 0.9,
                  span: { offset: 13, length: 3 },
                },
                {
                  content: "text.",
                  polygon: [67, 10, 95, 10, 95, 20, 67, 20],
                  confidence: 0.9,
                  span: { offset: 17, length: 5 },
                },
                {
                  content: "Line",
                  polygon: [10, 25, 40, 25, 40, 35, 10, 35],
                  confidence: 0.9,
                  span: { offset: 23, length: 4 },
                },
                {
                  content: "two",
                  polygon: [42, 25, 65, 25, 65, 35, 42, 35],
                  confidence: 0.9,
                  span: { offset: 28, length: 3 },
                },
                {
                  content: "text.",
                  polygon: [67, 25, 95, 25, 95, 35, 67, 35],
                  confidence: 0.9,
                  span: { offset: 32, length: 5 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Explain",
                boundingRegions: [
                  { pageNumber: 1, polygon: [0, 0, 50, 0, 50, 15, 0, 15] },
                ],
                spans: [{ offset: 0, length: 7 }],
              },
              value: {
                content: "Line one text. Line two text.",
                boundingRegions: [
                  { pageNumber: 1, polygon: [10, 10, 95, 10, 95, 35, 10, 35] },
                ],
                spans: [{ offset: 8, length: 30 }],
              },
              confidence: 0.9,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "explain_changes",
          field_type: FieldType.string,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    const suggestion = suggestions.find(
      (s) => s.field_key === "explain_changes",
    );
    expect(suggestion).toBeDefined();
    expect(suggestion?.element_ids).toHaveLength(6);
    expect(suggestion?.value).toBe("Line one text. Line two text.");
  });

  it("skips KVP suggestion when value has no content (e.g. no spouse signature)", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "Spouse signature",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "Spouse",
                  polygon: [10, 10, 60, 10, 60, 20, 10, 20],
                  confidence: 0.9,
                  span: { offset: 0, length: 6 },
                },
                {
                  content: "signature",
                  polygon: [62, 10, 130, 10, 130, 20, 62, 20],
                  confidence: 0.9,
                  span: { offset: 7, length: 9 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Spouse signature",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 10, 130, 10, 130, 20, 10, 20],
                  },
                ],
                spans: [{ offset: 0, length: 16 }],
              },
              value: { content: "", boundingRegions: [], spans: [] },
              confidence: 0.9,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "spouse_signature",
          field_type: FieldType.string,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    expect(
      suggestions.find((s) => s.field_key === "spouse_signature"),
    ).toBeUndefined();
  });

  it("matches sin field when OCR key is Social Insurance Number", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "Social Insurance Number 123-456-789",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "123-456-789",
                  polygon: [10, 10, 120, 10, 120, 20, 10, 20],
                  confidence: 0.9,
                  span: { offset: 24, length: 11 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Social Insurance Number",
                boundingRegions: [
                  { pageNumber: 1, polygon: [0, 0, 180, 0, 180, 15, 0, 15] },
                ],
                spans: [{ offset: 0, length: 23 }],
              },
              value: {
                content: "123-456-789",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 10, 120, 10, 120, 20, 10, 20],
                  },
                ],
                spans: [{ offset: 24, length: 11 }],
              },
              confidence: 0.9,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "sin",
          field_type: FieldType.string,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    const suggestion = suggestions.find((s) => s.field_key === "sin");
    expect(suggestion).toBeDefined();
    expect(suggestion?.value).toBe("123-456-789");
  });

  it("matches table row Worker's Compensation for applicant_workers_compensation", () => {
    const valueCellPolygon = [495, 95, 530, 95, 530, 125, 495, 125];
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "0",
                  polygon: [500, 98, 510, 98, 510, 118, 500, 118],
                  confidence: 0.99,
                  span: { offset: 10, length: 1 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [
            {
              rowCount: 3,
              columnCount: 3,
              boundingRegions: [],
              spans: [],
              cells: [
                {
                  rowIndex: 0,
                  columnIndex: 0,
                  content: "Income",
                  boundingRegions: [
                    { pageNumber: 1, polygon: [0, 0, 80, 0, 80, 20, 0, 20] },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 0,
                  columnIndex: 1,
                  content: "Applicant",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [100, 0, 180, 0, 180, 20, 100, 20],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 0,
                  columnIndex: 2,
                  content: "Spouse",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [200, 0, 260, 0, 260, 20, 200, 20],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 1,
                  columnIndex: 0,
                  content: "Worker's Compensation",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [0, 100, 180, 100, 180, 120, 0, 120],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 1,
                  columnIndex: 1,
                  content: "$ 0",
                  boundingRegions: [
                    { pageNumber: 1, polygon: valueCellPolygon },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 1,
                  columnIndex: 2,
                  content: "",
                  boundingRegions: [],
                  spans: [],
                  elements: [],
                },
              ],
            },
          ],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "applicant_workers_compensation",
          field_type: FieldType.number,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    const suggestion = suggestions.find(
      (s) => s.field_key === "applicant_workers_compensation",
    );
    expect(suggestion).toBeDefined();
    expect(suggestion?.source_type).toBe("tableCellToWords");
    expect(suggestion?.value).toBe("0");
  });

  it("matches table row Income of Dependent Children for applicant_income_of_dependent_children", () => {
    const valueCellPolygon = [495, 95, 530, 95, 530, 125, 495, 125];
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "0",
                  polygon: [500, 98, 510, 98, 510, 118, 500, 118],
                  confidence: 0.99,
                  span: { offset: 10, length: 1 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [
            {
              rowCount: 3,
              columnCount: 3,
              boundingRegions: [],
              spans: [],
              cells: [
                {
                  rowIndex: 0,
                  columnIndex: 0,
                  content: "Income",
                  boundingRegions: [
                    { pageNumber: 1, polygon: [0, 0, 80, 0, 80, 20, 0, 20] },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 0,
                  columnIndex: 1,
                  content: "Applicant",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [100, 0, 180, 0, 180, 20, 100, 20],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 0,
                  columnIndex: 2,
                  content: "Spouse",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [200, 0, 260, 0, 260, 20, 200, 20],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 1,
                  columnIndex: 0,
                  content: "Income of Dependent Children",
                  boundingRegions: [
                    {
                      pageNumber: 1,
                      polygon: [0, 100, 250, 100, 250, 120, 0, 120],
                    },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 1,
                  columnIndex: 1,
                  content: "$ 0",
                  boundingRegions: [
                    { pageNumber: 1, polygon: valueCellPolygon },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 1,
                  columnIndex: 2,
                  content: "",
                  boundingRegions: [],
                  spans: [],
                  elements: [],
                },
              ],
            },
          ],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "applicant_income_of_dependent_children",
          field_type: FieldType.number,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    const suggestion = suggestions.find(
      (s) => s.field_key === "applicant_income_of_dependent_children",
    );
    expect(suggestion).toBeDefined();
    expect(suggestion?.source_type).toBe("tableCellToWords");
    expect(suggestion?.value).toBe("0");
  });

  it("matches Applicant Print Name to name and Spouse Print Name to spouse_name (tie-break by longer alias)", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "Applicant Print Name John Spouse Print Name Jane",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "John",
                  polygon: [15, 12, 45, 12, 45, 22, 15, 22],
                  confidence: 0.9,
                  span: { offset: 20, length: 4 },
                },
                {
                  content: "Jane",
                  polygon: [15, 32, 42, 32, 42, 42, 15, 42],
                  confidence: 0.9,
                  span: { offset: 45, length: 4 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Applicant Print Name",
                boundingRegions: [
                  { pageNumber: 1, polygon: [0, 0, 100, 0, 100, 15, 0, 15] },
                ],
                spans: [{ offset: 0, length: 19 }],
              },
              value: {
                content: "John",
                boundingRegions: [
                  { pageNumber: 1, polygon: [10, 10, 50, 10, 50, 25, 10, 25] },
                ],
                spans: [{ offset: 20, length: 4 }],
              },
              confidence: 0.9,
            },
            {
              key: {
                content: "Spouse Print Name",
                boundingRegions: [
                  { pageNumber: 1, polygon: [0, 26, 120, 26, 120, 41, 0, 41] },
                ],
                spans: [{ offset: 25, length: 18 }],
              },
              value: {
                content: "Jane",
                boundingRegions: [
                  { pageNumber: 1, polygon: [10, 30, 45, 30, 45, 45, 10, 45] },
                ],
                spans: [{ offset: 44, length: 4 }],
              },
              confidence: 0.9,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "name",
          field_type: FieldType.string,
          field_format: null,
          display_order: 0,
        },
        {
          id: "f2",
          project_id: "p1",
          field_key: "spouse_name",
          field_type: FieldType.string,
          field_format: null,
          display_order: 1,
        },
      ],
    );

    const nameSuggestion = suggestions.find((s) => s.field_key === "name");
    const spouseNameSuggestion = suggestions.find(
      (s) => s.field_key === "spouse_name",
    );
    expect(nameSuggestion).toBeDefined();
    expect(nameSuggestion?.value).toBe("John");
    expect(spouseNameSuggestion).toBeDefined();
    expect(spouseNameSuggestion?.value).toBe("Jane");
  });

  it("assigns repeated Date key by document order: first to date, second to spouse_date", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "Date 2025-Nov-12 Date 2025-Nov-10",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "2025-Nov-12",
                  polygon: [15, 12, 95, 12, 95, 22, 15, 22],
                  confidence: 0.9,
                  span: { offset: 5, length: 11 },
                },
                {
                  content: "2025-Nov-10",
                  polygon: [15, 32, 95, 32, 95, 42, 15, 42],
                  confidence: 0.9,
                  span: { offset: 22, length: 11 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Date (yyyy-mmm-dd)",
                boundingRegions: [],
                spans: [{ offset: 0, length: 4 }],
              },
              value: {
                content: "2025-Nov-12",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 10, 100, 10, 100, 25, 10, 25],
                  },
                ],
                spans: [{ offset: 5, length: 11 }],
              },
              confidence: 0.97,
            },
            {
              key: {
                content: "Date (yyyy-mmm-dd)",
                boundingRegions: [],
                spans: [{ offset: 17, length: 4 }],
              },
              value: {
                content: "2025-Nov-10",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 30, 100, 30, 100, 45, 10, 45],
                  },
                ],
                spans: [{ offset: 22, length: 11 }],
              },
              confidence: 0.97,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "date",
          field_type: FieldType.date,
          field_format: "dmy",
          display_order: 0,
        },
        {
          id: "f2",
          project_id: "p1",
          field_key: "spouse_date",
          field_type: FieldType.date,
          field_format: "dmy",
          display_order: 1,
        },
      ],
    );

    const dateSuggestion = suggestions.find((s) => s.field_key === "date");
    const spouseDateSuggestion = suggestions.find(
      (s) => s.field_key === "spouse_date",
    );
    expect(dateSuggestion?.value).toBe("2025-Nov-12");
    expect(spouseDateSuggestion?.value).toBe("2025-Nov-10");
  });

  it("matches Spouse Telephone to spouse_phone via telephone alias", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "Spouse Telephone 604-555-1234",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "604-555-1234",
                  polygon: [15, 12, 95, 12, 95, 22, 15, 22],
                  confidence: 0.9,
                  span: { offset: 18, length: 12 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Spouse Telephone",
                boundingRegions: [
                  { pageNumber: 1, polygon: [0, 0, 120, 0, 120, 15, 0, 15] },
                ],
                spans: [],
              },
              value: {
                content: "604-555-1234",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 10, 100, 10, 100, 25, 10, 25],
                  },
                ],
                spans: [{ offset: 18, length: 12 }],
              },
              confidence: 0.9,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "spouse_phone",
          field_type: FieldType.string,
          field_format: null,
          display_order: 0,
        },
      ],
    );

    const suggestion = suggestions.find((s) => s.field_key === "spouse_phone");
    expect(suggestion).toBeDefined();
    expect(suggestion?.value).toBe("604-555-1234");
  });

  it("assigns second Social Insurance Number to spouse_sin by document order", () => {
    const suggestions = service.generateSuggestions(
      {
        status: "succeeded",
        createdDateTime: "",
        lastUpdatedDateTime: "",
        analyzeResult: {
          apiVersion: "2024-11-30",
          modelId: "prebuilt-layout",
          stringIndexType: "textElements",
          content: "SIN 111-222-333 SIN 444-555-666",
          pages: [
            {
              pageNumber: 1,
              angle: 0,
              width: 1000,
              height: 1000,
              unit: "pixel",
              words: [
                {
                  content: "111-222-333",
                  polygon: [15, 12, 95, 12, 95, 22, 15, 22],
                  confidence: 0.9,
                  span: { offset: 4, length: 11 },
                },
                {
                  content: "444-555-666",
                  polygon: [15, 32, 95, 32, 95, 42, 15, 42],
                  confidence: 0.9,
                  span: { offset: 21, length: 11 },
                },
              ],
              selectionMarks: [],
              lines: [],
              spans: [],
            },
          ],
          tables: [],
          paragraphs: [],
          styles: [],
          contentFormat: "text",
          sections: [],
          figures: [],
          keyValuePairs: [
            {
              key: {
                content: "Social Insurance Number",
                boundingRegions: [],
                spans: [],
              },
              value: {
                content: "111-222-333",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 10, 100, 10, 100, 25, 10, 25],
                  },
                ],
                spans: [{ offset: 4, length: 11 }],
              },
              confidence: 0.9,
            },
            {
              key: {
                content: "Social Insurance Number",
                boundingRegions: [],
                spans: [],
              },
              value: {
                content: "444-555-666",
                boundingRegions: [
                  {
                    pageNumber: 1,
                    polygon: [10, 30, 100, 30, 100, 45, 10, 45],
                  },
                ],
                spans: [{ offset: 21, length: 11 }],
              },
              confidence: 0.9,
            },
          ],
        },
      },
      [
        {
          id: "f1",
          project_id: "p1",
          field_key: "sin",
          field_type: FieldType.string,
          field_format: null,
          display_order: 0,
        },
        {
          id: "f2",
          project_id: "p1",
          field_key: "spouse_sin",
          field_type: FieldType.string,
          field_format: null,
          display_order: 1,
        },
      ],
    );

    expect(suggestions.find((s) => s.field_key === "sin")?.value).toBe(
      "111-222-333",
    );
    expect(suggestions.find((s) => s.field_key === "spouse_sin")?.value).toBe(
      "444-555-666",
    );
  });
});
