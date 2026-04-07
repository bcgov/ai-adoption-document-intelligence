/**
 * Unit tests for FormatSuggestionService.
 */

import { FieldType } from "@generated/client";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { of } from "rxjs";
import { PrismaService } from "@/database/prisma.service";
import { FormatSuggestionService } from "./format-suggestion.service";

describe("FormatSuggestionService", () => {
  let service: FormatSuggestionService;
  let httpService: HttpService;

  const mockTemplateModel = {
    id: "tm-1",
    group_id: "group-1",
    field_schema: [
      {
        id: "f-1",
        field_key: "sin",
        field_type: FieldType.string,
        format_spec: null,
      },
      {
        id: "f-2",
        field_key: "phone",
        field_type: FieldType.string,
        format_spec: null,
      },
      {
        id: "f-3",
        field_key: "amount",
        field_type: FieldType.number,
        format_spec: '{"canonicalize":"number"}',
      },
    ],
  };

  const mockCorrections = [
    {
      field_key: "sin",
      original_value: "123 456 789",
      corrected_value: "123456789",
    },
    {
      field_key: "sin",
      original_value: "987-654-321",
      corrected_value: "987654321",
    },
    {
      field_key: "phone",
      original_value: "6045551234",
      corrected_value: "(604) 555-1234",
    },
  ];

  const mockBenchmarkRuns = [
    {
      id: "run-1",
      metrics: {
        perSampleResults: [
          {
            sampleId: "sample-1",
            evaluationDetails: [
              {
                field: "sin",
                matched: false,
                predicted: "123 456 789",
                expected: "123456789",
              },
              {
                field: "phone",
                matched: true,
                predicted: "(604) 555-1234",
                expected: "(604) 555-1234",
              },
            ],
          },
          {
            sampleId: "sample-2",
            evaluationDetails: [
              {
                field: "sin",
                matched: false,
                predicted: "987-654-321",
                expected: "987654321",
              },
            ],
          },
        ],
      },
    },
  ];

  let mockPrisma: {
    templateModel: { findUniqueOrThrow: jest.Mock };
    fieldCorrection: { findMany: jest.Mock };
    benchmarkRun: { findMany: jest.Mock };
  };

  const mockAiResponse = JSON.stringify([
    {
      fieldKey: "sin",
      formatSpec: { canonicalize: "digits", pattern: "^\\d{9}$" },
      rationale: "Both corrections strip spaces/dashes from 9-digit values",
    },
    {
      fieldKey: "phone",
      formatSpec: {
        canonicalize: "digits",
        displayTemplate: "(###) ###-####",
      },
      rationale: "Correction shows phone number formatting pattern",
    },
  ]);

  beforeEach(async () => {
    mockPrisma = {
      templateModel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(mockTemplateModel),
      },
      fieldCorrection: {
        findMany: jest.fn().mockResolvedValue(mockCorrections),
      },
      benchmarkRun: {
        findMany: jest.fn().mockResolvedValue(mockBenchmarkRuns),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormatSuggestionService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn().mockReturnValue(
              of({
                data: {
                  choices: [
                    {
                      message: {
                        content: mockAiResponse,
                      },
                    },
                  ],
                },
              }),
            ),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const env: Record<string, string> = {
                AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
                AZURE_OPENAI_API_KEY: "test-key",
                AZURE_OPENAI_DEPLOYMENT: "gpt-4",
              };
              return env[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FormatSuggestionService>(FormatSuggestionService);
    httpService = module.get<HttpService>(HttpService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("gatherErrorData", () => {
    it("loads template model fields and queries corrections filtered by group_id and field keys", async () => {
      const result = await service.gatherErrorData("tm-1");

      expect(mockPrisma.templateModel.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: "tm-1" },
        include: { field_schema: true },
      });

      expect(mockPrisma.fieldCorrection.findMany).toHaveBeenCalledWith({
        where: {
          action: "corrected",
          field_key: { in: ["sin", "phone", "amount"] },
          session: {
            document: {
              group_id: "group-1",
            },
          },
        },
        select: {
          field_key: true,
          original_value: true,
          corrected_value: true,
        },
        take: 200,
        orderBy: { created_at: "desc" },
      });

      expect(result.fields).toHaveLength(3);
      expect(result.fields[0]).toEqual({
        field_key: "sin",
        field_type: FieldType.string,
        format_spec: null,
      });
      expect(result.totalCorrectionCount).toBe(3);
    });

    it("groups corrections by field key", async () => {
      const result = await service.gatherErrorData("tm-1");

      expect(result.corrections["sin"]).toHaveLength(2);
      expect(result.corrections["sin"][0]).toEqual({
        original: "123 456 789",
        corrected: "123456789",
      });
      expect(result.corrections["phone"]).toHaveLength(1);
    });

    it("returns empty corrections when template model has no fields", async () => {
      mockPrisma.templateModel.findUniqueOrThrow.mockResolvedValueOnce({
        ...mockTemplateModel,
        field_schema: [],
      });

      const result = await service.gatherErrorData("tm-1");

      expect(result.fields).toHaveLength(0);
      expect(result.corrections).toEqual({});
      expect(result.totalCorrectionCount).toBe(0);
      expect(mockPrisma.fieldCorrection.findMany).not.toHaveBeenCalled();
    });

    it("merges benchmark run mismatches with HITL corrections when benchmarkRunIds provided", async () => {
      // No HITL corrections for this test
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

      const result = await service.gatherErrorData("tm-1", ["run-1"]);

      expect(mockPrisma.benchmarkRun.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["run-1"] }, status: "completed" },
        select: { id: true, metrics: true },
      });

      // Two mismatches for "sin" field (matched=false entries), phone is matched=true so skipped
      expect(result.corrections["sin"]).toHaveLength(2);
      expect(result.corrections["sin"][0]).toEqual({
        original: "123 456 789",
        corrected: "123456789",
      });
      expect(result.corrections["sin"][1]).toEqual({
        original: "987-654-321",
        corrected: "987654321",
      });
      expect(result.corrections["phone"]).toBeUndefined();
      expect(result.totalCorrectionCount).toBe(2);
    });

    it("merges benchmark mismatches on top of HITL corrections when both provided", async () => {
      // HITL has one phone correction
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([
        {
          field_key: "phone",
          original_value: "6045551234",
          corrected_value: "(604) 555-1234",
        },
      ]);

      const result = await service.gatherErrorData("tm-1", ["run-1"]);

      // phone from HITL + sin mismatches from benchmark
      expect(result.corrections["phone"]).toHaveLength(1);
      expect(result.corrections["sin"]).toHaveLength(2);
      expect(result.totalCorrectionCount).toBe(3);
    });

    it("filters benchmark mismatches to only include template model field keys", async () => {
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);
      mockPrisma.benchmarkRun.findMany.mockResolvedValueOnce([
        {
          id: "run-2",
          metrics: {
            perSampleResults: [
              {
                sampleId: "s1",
                evaluationDetails: [
                  {
                    field: "unknown_field",
                    matched: false,
                    predicted: "foo",
                    expected: "bar",
                  },
                  {
                    field: "sin",
                    matched: false,
                    predicted: "123 456 789",
                    expected: "123456789",
                  },
                ],
              },
            ],
          },
        },
      ]);

      const result = await service.gatherErrorData("tm-1", ["run-2"]);

      // unknown_field is not in template model's field schema, should be filtered out
      expect(result.corrections["unknown_field"]).toBeUndefined();
      expect(result.corrections["sin"]).toHaveLength(1);
    });
  });

  describe("suggestFormats", () => {
    it("returns suggestions from AI response with correct structure", async () => {
      const result = await service.suggestFormats("tm-1");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        fieldKey: "sin",
        formatSpec: { canonicalize: "digits", pattern: "^\\d{9}$" },
        rationale: "Both corrections strip spaces/dashes from 9-digit values",
        sampleCount: 2,
      });
      expect(result[1]).toEqual({
        fieldKey: "phone",
        formatSpec: {
          canonicalize: "digits",
          displayTemplate: "(###) ###-####",
        },
        rationale: "Correction shows phone number formatting pattern",
        sampleCount: 1,
      });
    });

    it("sends correct prompt structure to Azure OpenAI", async () => {
      const post = httpService.post as jest.Mock;
      await service.suggestFormats("tm-1");

      expect(post).toHaveBeenCalledTimes(1);
      const [url, payload, config] = post.mock.calls[0] as [
        string,
        {
          messages: Array<{ role: string; content: string }>;
          response_format: { type: string };
        },
        { headers: Record<string, string>; timeout: number },
      ];

      expect(url).toContain("openai/deployments/gpt-4/chat/completions");
      expect(url).toContain("api-version=");

      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0].role).toBe("system");
      expect(payload.messages[0].content).toContain(
        "analyzing OCR error patterns",
      );
      expect(payload.messages[1].role).toBe("user");
      expect(payload.messages[1].content).toContain("sin");
      expect(payload.messages[1].content).toContain("phone");
      expect(payload.messages[1].content).toContain("canonicalize");
      expect(payload.messages[1].content).toContain("corrections");
      expect(payload.response_format).toEqual({ type: "json_object" });

      expect(config.headers["api-key"]).toBe("test-key");
      expect(config.timeout).toBe(120000);
    });

    it("includes benchmark mismatches in prompt when benchmarkRunIds provided", async () => {
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);
      const post = httpService.post as jest.Mock;
      await service.suggestFormats("tm-1", ["run-1"]);

      expect(post).toHaveBeenCalledTimes(1);
      const [, payload] = post.mock.calls[0] as [
        string,
        { messages: Array<{ role: string; content: string }> },
      ];
      expect(payload.messages[1].content).toContain(
        "corrections and benchmark mismatches",
      );
    });

    it("uses HITL corrections label in prompt when no benchmarkRunIds provided", async () => {
      const post = httpService.post as jest.Mock;
      await service.suggestFormats("tm-1");

      expect(post).toHaveBeenCalledTimes(1);
      const [, payload] = post.mock.calls[0] as [
        string,
        { messages: Array<{ role: string; content: string }> },
      ];
      expect(payload.messages[1].content).toContain("HITL corrections");
    });

    it("returns empty array when no corrections exist", async () => {
      mockPrisma.fieldCorrection.findMany.mockResolvedValueOnce([]);

      const result = await service.suggestFormats("tm-1");

      expect(result).toEqual([]);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it("returns empty array when AI returns invalid JSON", async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            choices: [{ message: { content: "not valid json {{{" } }],
          },
        }),
      );

      const result = await service.suggestFormats("tm-1");
      expect(result).toEqual([]);
    });

    it("returns empty array when AI returns non-array JSON without formatSpec entries", async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            choices: [
              { message: { content: JSON.stringify({ result: "nothing" }) } },
            ],
          },
        }),
      );

      const result = await service.suggestFormats("tm-1");
      expect(result).toEqual([]);
    });

    it("parses AI response wrapped in suggestions key", async () => {
      const wrapped = JSON.stringify({
        suggestions: [
          {
            fieldKey: "sin",
            formatSpec: { canonicalize: "digits", pattern: "^\\d{9}$" },
            rationale: "Strip separators",
          },
        ],
      });
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: { choices: [{ message: { content: wrapped } }] },
        }),
      );

      const result = await service.suggestFormats("tm-1");
      expect(result).toHaveLength(1);
      expect(result[0].fieldKey).toBe("sin");
      expect(result[0].formatSpec.canonicalize).toBe("digits");
    });

    it("parses AI response keyed by field name", async () => {
      const keyed = JSON.stringify({
        sin: {
          formatSpec: { canonicalize: "digits", pattern: "^\\d{9}$" },
          rationale: "Strip separators",
        },
        phone: {
          formatSpec: {
            canonicalize: "digits",
            displayTemplate: "(###) ###-###",
          },
          rationale: "Reformat phone",
        },
      });
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: { choices: [{ message: { content: keyed } }] },
        }),
      );

      const result = await service.suggestFormats("tm-1");
      expect(result).toHaveLength(2);
      expect(result.find((s) => s.fieldKey === "sin")).toBeDefined();
      expect(result.find((s) => s.fieldKey === "phone")).toBeDefined();
    });

    it("handles markdown code fences in AI response", async () => {
      const fencedResponse = "```json\n" + mockAiResponse + "\n```";
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            choices: [{ message: { content: fencedResponse } }],
          },
        }),
      );

      const result = await service.suggestFormats("tm-1");
      expect(result).toHaveLength(2);
      expect(result[0].fieldKey).toBe("sin");
    });

    it("throws when Azure OpenAI config is missing", async () => {
      const module2 = await Test.createTestingModule({
        providers: [
          FormatSuggestionService,
          {
            provide: PrismaService,
            useValue: { prisma: mockPrisma },
          },
          { provide: HttpService, useValue: { post: jest.fn() } },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
        ],
      }).compile();

      const svc = module2.get<FormatSuggestionService>(FormatSuggestionService);
      await expect(svc.suggestFormats("tm-1")).rejects.toThrow(
        "Azure OpenAI configuration missing",
      );
    });

    it("filters out malformed suggestions from AI response", async () => {
      const responseMixed = JSON.stringify([
        {
          fieldKey: "sin",
          formatSpec: { canonicalize: "digits", pattern: "^\\d{9}$" },
          rationale: "Valid suggestion",
        },
        { fieldKey: "bad", rationale: "Missing formatSpec" },
        {
          formatSpec: { canonicalize: "digits" },
          rationale: "Missing fieldKey",
        },
        null,
        "not an object",
      ]);
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            choices: [{ message: { content: responseMixed } }],
          },
        }),
      );

      const result = await service.suggestFormats("tm-1");
      expect(result).toHaveLength(1);
      expect(result[0].fieldKey).toBe("sin");
    });
  });
});
