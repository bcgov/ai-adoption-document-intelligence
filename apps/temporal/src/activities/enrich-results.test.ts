/**
 * Unit tests for enrichResults activity (ocr.enrich).
 * Mocks database and optional LLM; uses real enrichment rules.
 */

import type { OCRResult } from "../types";
import { getPrismaClient } from "./database-client";
import { type EnrichResultsParams, enrichResults } from "./enrich-results";
import * as enrichmentLlm from "./enrichment-llm";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

function minimalOcrResult(overrides: Partial<OCRResult> = {}): OCRResult {
  return {
    success: true,
    status: "succeeded",
    apimRequestId: "test",
    fileName: "test.pdf",
    fileType: "pdf",
    modelId: "prebuilt-layout",
    extractedText: "",
    pages: [],
    tables: [],
    paragraphs: [],
    keyValuePairs: [
      {
        key: { content: "Date", boundingRegions: [], spans: [] },
        value: {
          content: "2O24-0l-15",
          boundingRegions: [{ pageNumber: 1, polygon: [] }],
          spans: [{ offset: 0, length: 0 }],
        },
        confidence: 0.9,
      },
      {
        key: { content: "Amount", boundingRegions: [], spans: [] },
        value: {
          content: "$ 1,234.56",
          boundingRegions: [{ pageNumber: 1, polygon: [] }],
          spans: [{ offset: 0, length: 0 }],
        },
        confidence: 0.8,
      },
    ],
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
    ...overrides,
  };
}

function projectWithSchema(
  fieldSchema: Array<{
    field_key: string;
    field_type: string;
    field_format?: string | null;
  }>,
) {
  return {
    id: "project-1",
    field_schema: fieldSchema,
  };
}

describe("enrichResults activity", () => {
  let prismaMock: {
    labelingProject: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prismaMock = {
      labelingProject: {
        findUnique: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("when project not found or empty schema", () => {
    it("returns ocrResult unchanged and summary null when project not found", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue(null);
      const ocrResult = minimalOcrResult();
      const params: EnrichResultsParams = {
        documentId: "doc-1",
        ocrResult,
        documentType: "missing-project",
      };

      const result = await enrichResults(params);

      expect(result.ocrResult).toBe(ocrResult);
      expect(result.summary).toBeNull();
      expect(prismaMock.labelingProject.findUnique).toHaveBeenCalledWith({
        where: { id: "missing-project" },
        include: { field_schema: { orderBy: { display_order: "asc" } } },
      });
    });

    it("returns ocrResult unchanged and summary null when field_schema is empty", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue({
        id: "project-1",
        field_schema: [],
      });
      const ocrResult = minimalOcrResult();
      const params: EnrichResultsParams = {
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
      };

      const result = await enrichResults(params);

      expect(result.ocrResult).toBe(ocrResult);
      expect(result.summary).toBeNull();
    });

    it("returns ocrResult unchanged and summary null when field_schema is null/undefined", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue({
        id: "project-1",
        field_schema: null,
      });
      const ocrResult = minimalOcrResult();
      const result = await enrichResults({
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
      });
      expect(result.ocrResult).toBe(ocrResult);
      expect(result.summary).toBeNull();
    });
  });

  describe("when project has field_schema (rules only)", () => {
    it("applies rules and returns enriched ocrResult with summary", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue(
        projectWithSchema([
          { field_key: "Date", field_type: "date", field_format: null },
          { field_key: "Amount", field_type: "number", field_format: null },
        ]),
      );
      const ocrResult = minimalOcrResult();
      const params: EnrichResultsParams = {
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
      };

      const result = await enrichResults(params);

      expect(result.ocrResult).not.toBe(ocrResult);
      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
        "2024-01-15",
      );
      expect(result.ocrResult.keyValuePairs[1].value?.content).toBe("1234.56");
      expect(result.summary).not.toBeNull();
      expect(result.summary?.changes.length).toBeGreaterThan(0);
      expect(result.summary?.rulesApplied).toContain("trimWhitespace");
      expect(result.summary?.llmEnriched).toBe(false);
    });

    it("uses custom confidenceThreshold when provided", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue(
        projectWithSchema([{ field_key: "Date", field_type: "date" }]),
      );
      const ocrResult = minimalOcrResult();
      await enrichResults({
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
        confidenceThreshold: 0.9,
      });
      expect(prismaMock.labelingProject.findUnique).toHaveBeenCalled();
    });
  });

  describe("when enableLlmEnrichment is true", () => {
    it("does not call LLM when no Azure env vars are set", async () => {
      const callSpy = jest.spyOn(enrichmentLlm, "callAzureOpenAI");
      const origEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const origKey = process.env.AZURE_OPENAI_API_KEY;
      const origDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
      delete process.env.AZURE_OPENAI_ENDPOINT;
      delete process.env.AZURE_OPENAI_API_KEY;
      delete process.env.AZURE_OPENAI_DEPLOYMENT;

      prismaMock.labelingProject.findUnique.mockResolvedValue(
        projectWithSchema([{ field_key: "Date", field_type: "date" }]),
      );
      const ocrResult = minimalOcrResult();
      ocrResult.keyValuePairs[0].confidence = 0.5;

      const result = await enrichResults({
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
        enableLlmEnrichment: true,
      });

      expect(callSpy).not.toHaveBeenCalled();
      expect(result.summary).not.toBeNull();
      expect(result.summary?.llmEnriched).toBe(false);

      if (origEndpoint !== undefined)
        process.env.AZURE_OPENAI_ENDPOINT = origEndpoint;
      if (origKey !== undefined) process.env.AZURE_OPENAI_API_KEY = origKey;
      if (origDeployment !== undefined)
        process.env.AZURE_OPENAI_DEPLOYMENT = origDeployment;
      callSpy.mockRestore();
    });

    it("calls LLM when Azure env set and merges corrected values into result", async () => {
      const callSpy = jest
        .spyOn(enrichmentLlm, "callAzureOpenAI")
        .mockResolvedValue({
          correctedValues: { Date: "2024-01-15" },
          summary: "Corrected date.",
          changes: [
            {
              fieldKey: "Date",
              originalValue: "2O24-0l-15",
              correctedValue: "2024-01-15",
              reason: "OCR fix",
            },
          ],
        });
      const origEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const origKey = process.env.AZURE_OPENAI_API_KEY;
      const origDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
      process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
      process.env.AZURE_OPENAI_API_KEY = "key";
      process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

      prismaMock.labelingProject.findUnique.mockResolvedValue(
        projectWithSchema([{ field_key: "Date", field_type: "date" }]),
      );
      const ocrResult = minimalOcrResult();
      ocrResult.keyValuePairs[0].confidence = 0.5;

      const result = await enrichResults({
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
        enableLlmEnrichment: true,
      });

      expect(callSpy).toHaveBeenCalled();
      expect(result.summary).not.toBeNull();
      expect(result.summary?.llmEnriched).toBe(true);
      expect(result.summary?.llmModel).toBe("gpt-4o");
      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
        "2024-01-15",
      );

      if (origEndpoint !== undefined)
        process.env.AZURE_OPENAI_ENDPOINT = origEndpoint;
      else delete process.env.AZURE_OPENAI_ENDPOINT;
      if (origKey !== undefined) process.env.AZURE_OPENAI_API_KEY = origKey;
      else delete process.env.AZURE_OPENAI_API_KEY;
      if (origDeployment !== undefined)
        process.env.AZURE_OPENAI_DEPLOYMENT = origDeployment;
      else delete process.env.AZURE_OPENAI_DEPLOYMENT;
      callSpy.mockRestore();
    });

    it("on LLM error returns rule result only and does not throw", async () => {
      jest
        .spyOn(enrichmentLlm, "callAzureOpenAI")
        .mockRejectedValue(new Error("API error"));
      process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
      process.env.AZURE_OPENAI_API_KEY = "key";
      process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o";

      prismaMock.labelingProject.findUnique.mockResolvedValue(
        projectWithSchema([{ field_key: "Date", field_type: "date" }]),
      );
      const ocrResult = minimalOcrResult();
      ocrResult.keyValuePairs[0].confidence = 0.5;

      const result = await enrichResults({
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
        enableLlmEnrichment: true,
      });

      expect(result.ocrResult.keyValuePairs[0].value?.content).toBe(
        "2024-01-15",
      );
      expect(result.summary).not.toBeNull();
      expect(result.summary?.llmEnriched).toBe(false);

      delete process.env.AZURE_OPENAI_ENDPOINT;
      delete process.env.AZURE_OPENAI_API_KEY;
      delete process.env.AZURE_OPENAI_DEPLOYMENT;
    });
  });

  describe("error handling", () => {
    it("on database error returns original ocrResult and summary null", async () => {
      prismaMock.labelingProject.findUnique.mockRejectedValue(
        new Error("Database connection failed"),
      );
      const ocrResult = minimalOcrResult();
      const params: EnrichResultsParams = {
        documentId: "doc-1",
        ocrResult,
        documentType: "project-1",
      };

      const result = await enrichResults(params);

      expect(result.ocrResult).toBe(ocrResult);
      expect(result.summary).toBeNull();
    });
  });

  describe("return shape (graph contract)", () => {
    it("returns object with ocrResult and summary keys for output port binding", async () => {
      prismaMock.labelingProject.findUnique.mockResolvedValue(
        projectWithSchema([{ field_key: "Date", field_type: "date" }]),
      );
      const result = await enrichResults({
        documentId: "doc-1",
        ocrResult: minimalOcrResult(),
        documentType: "project-1",
      });

      expect(result).toHaveProperty("ocrResult");
      expect(result).toHaveProperty("summary");
      expect(typeof result.ocrResult).toBe("object");
      expect(
        result.summary === null || typeof result.summary === "object",
      ).toBe(true);
    });
  });
});
