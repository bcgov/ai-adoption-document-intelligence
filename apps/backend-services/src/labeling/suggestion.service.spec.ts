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
                    { pageNumber: 1, polygon: [450, 240, 560, 240, 560, 270, 450, 270] },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 2,
                  columnIndex: 0,
                  content: "Net Employment Income",
                  boundingRegions: [
                    { pageNumber: 1, polygon: [300, 290, 450, 290, 450, 330, 300, 330] },
                  ],
                  spans: [],
                  elements: [],
                },
                {
                  rowIndex: 2,
                  columnIndex: 1,
                  content: "$ 0",
                  boundingRegions: [
                    { pageNumber: 1, polygon: [495, 295, 530, 295, 530, 325, 495, 325] },
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
  });
});
