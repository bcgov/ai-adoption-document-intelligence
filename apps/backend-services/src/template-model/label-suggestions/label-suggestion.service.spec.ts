import { FieldType } from "@generated/client";
import { HttpException, NotFoundException } from "@nestjs/common";
import type { AnalysisResult } from "@/ocr/azure-types";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { syntheticLayoutResult } from "@/testUtils/synthetic-layout";
import type { TemplateModelDbService } from "../template-model-db.service";
import type {
  LabeledDocumentData,
  TemplateModelData,
} from "../template-model-db.types";
import {
  LabelSuggestionService,
  normalizeFieldKey,
} from "./label-suggestion.service";
import type { SuggestionLlmService } from "./suggestion-llm";

function templateModelWith(
  fields: Array<{
    key: string;
    type: FieldType;
    description: string | null;
  }>,
): TemplateModelData {
  return {
    id: "tm-1",
    name: "Test",
    model_id: "test",
    description: null,
    created_by: "user-1",
    created_at: new Date(),
    updated_at: new Date(),
    status: "draft",
    group_id: "group-1",
    field_schema: fields.map((field, index) => ({
      id: `f${index}`,
      template_model_id: "tm-1",
      field_key: field.key,
      field_type: field.type,
      field_format: null,
      format_spec: null,
      description: field.description,
      display_order: index,
    })),
  } as unknown as TemplateModelData;
}

function documentWith(result: AnalysisResult | null): LabeledDocumentData {
  return {
    id: "ld-1",
    template_model_id: "tm-1",
    labeling_document_id: "doc-1",
    status: "unlabeled",
    created_at: new Date(),
    updated_at: new Date(),
    labels: [],
    labeling_document: {
      ocr_result: result
        ? {
            status: "succeeded",
            createdDateTime: "",
            lastUpdatedDateTime: "",
            analyzeResult: result,
          }
        : null,
    },
  } as unknown as LabeledDocumentData;
}

describe("LabelSuggestionService", () => {
  const templateModelDb = {
    findTemplateModel: jest.fn(),
    findLabeledDocument: jest.fn(),
  };
  const llm = { generate: jest.fn() };
  const service = new LabelSuggestionService(
    templateModelDb as unknown as TemplateModelDbService,
    llm as unknown as SuggestionLlmService,
    mockAppLogger,
  );
  const fields = templateModelWith([
    {
      key: "name",
      type: FieldType.string,
      description: "Applicant name, after the caption",
    },
    { key: "wants_help", type: FieldType.selectionMark, description: null },
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    templateModelDb.findTemplateModel.mockResolvedValue(fields);
    templateModelDb.findLabeledDocument.mockResolvedValue(
      documentWith(syntheticLayoutResult()),
    );
  });

  describe("suggestLabels", () => {
    it("turns the reply's tags into labels and ignores unknown keys", async () => {
      llm.generate.mockResolvedValue({
        fields: [
          { key: "name", refs: [{ tag: "L1", text: "Jane Doe" }] },
          { key: "wants_help", refs: [{ tag: "S1", text: "" }] },
          { key: "not_a_field", refs: [{ tag: "L2", text: "Yes" }] },
        ],
      });

      const suggestions = await service.suggestLabels("tm-1", "doc-1");

      expect(suggestions).toEqual([
        {
          field_key: "name",
          label_name: "name",
          value: "Jane Doe",
          page_number: 1,
          element_ids: ["p1-w1", "p1-w2"],
          bounding_box: { polygon: [2, 0, 5, 0, 5, 1, 2, 1] },
          source_type: "llm",
          explanation: "Line L1",
        },
        {
          field_key: "wants_help",
          label_name: "wants_help",
          value: "selected",
          page_number: 1,
          element_ids: ["p1-sm0"],
          bounding_box: { polygon: [0, 2, 1, 2, 1, 3, 0, 3] },
          source_type: "llm",
          explanation: "Checkbox S1",
        },
      ]);
    });

    it("sends the field list with descriptions and the tagged text", async () => {
      llm.generate.mockResolvedValue({ fields: [] });

      await service.suggestLabels("tm-1", "doc-1");

      const call = llm.generate.mock.calls[0][0];
      expect(call.prompt).toContain(
        "- name (string): Applicant name, after the caption",
      );
      expect(call.prompt).toContain("- wants_help (selectionMark)");
      expect(call.prompt).toContain("[L1] Name Jane Doe");
      expect(call.schemaName).toBe("suggested_labels");
    });

    it("drops a field whose text is not on its tag", async () => {
      llm.generate.mockResolvedValue({
        fields: [{ key: "name", refs: [{ tag: "L1", text: "John Smith" }] }],
      });
      await expect(service.suggestLabels("tm-1", "doc-1")).resolves.toEqual([]);
    });

    it("refuses with 422 when the template model has no fields", async () => {
      templateModelDb.findTemplateModel.mockResolvedValue(
        templateModelWith([]),
      );
      const error = await service
        .suggestLabels("tm-1", "doc-1")
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(422);
      expect(llm.generate).not.toHaveBeenCalled();
    });

    it("refuses with 422 when the document is too long", async () => {
      const base = syntheticLayoutResult();
      templateModelDb.findLabeledDocument.mockResolvedValue(
        documentWith({
          ...base,
          pages: Array.from({ length: 31 }, (_, i) => ({
            ...base.pages[0],
            pageNumber: i + 1,
          })),
        }),
      );
      const error = await service
        .suggestLabels("tm-1", "doc-1")
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(422);
    });

    it("returns 404 when the document has no OCR result", async () => {
      templateModelDb.findLabeledDocument.mockResolvedValue(documentWith(null));
      await expect(service.suggestLabels("tm-1", "doc-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns 404 for an unknown document", async () => {
      templateModelDb.findLabeledDocument.mockResolvedValue(null);
      await expect(service.suggestLabels("tm-1", "doc-9")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("suggestFields", () => {
    it("normalises and de-duplicates keys, resolves values and flags existing keys", async () => {
      llm.generate.mockResolvedValue({
        fields: [
          {
            key: "Applicant Name",
            type: "string",
            description: " Name after the caption ",
            refs: [{ tag: "L1", text: "Jane Doe" }],
          },
          {
            key: "applicant name",
            type: "string",
            description: "Second applicant name",
            refs: [],
          },
          {
            key: "wants_help",
            type: "selectionMark",
            description: "Ticked when help is wanted",
            refs: [{ tag: "S1", text: "" }],
          },
        ],
      });

      await expect(service.suggestFields("tm-1", "doc-1")).resolves.toEqual([
        {
          field_key: "applicant_name",
          field_type: "string",
          description: "Name after the caption",
          value: "Jane Doe",
          page_number: 1,
          already_exists: false,
        },
        {
          field_key: "applicant_name_2",
          field_type: "string",
          description: "Second applicant name",
          value: null,
          page_number: null,
          already_exists: false,
        },
        {
          field_key: "wants_help",
          field_type: "selectionMark",
          description: "Ticked when help is wanted",
          value: "selected",
          page_number: 1,
          already_exists: true,
        },
      ]);
      expect(llm.generate.mock.calls[0][0].schemaName).toBe("suggested_fields");
    });
  });

  describe("normalizeFieldKey", () => {
    it.each([
      ["Applicant Name", "applicant_name"],
      ["  --  ", "field"],
      ["2nd line", "field_2nd_line"],
      ["already_snake", "already_snake"],
    ])("turns %p into %p", (raw, expected) => {
      expect(normalizeFieldKey(raw)).toBe(expected);
    });
  });
});
