/**
 * Unit tests for AiRecommendationService.
 */

import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { of } from "rxjs";
import { AiRecommendationService } from "./ai-recommendation.service";

describe("AiRecommendationService", () => {
  let service: AiRecommendationService;
  let httpService: HttpService;

  const mockInput = {
    corrections: [
      {
        fieldKey: "Amount",
        originalValue: "1O0",
        correctedValue: "100",
        action: "corrected",
      },
    ],
    availableTools: [
      {
        toolId: "ocr.spellcheck",
        label: "Spellcheck",
        description: "Spellcheck",
        parameters: [],
      },
      {
        toolId: "ocr.characterConfusion",
        label: "Confusion",
        description: "Confusion",
        parameters: [],
      },
      {
        toolId: "ocr.normalizeFields",
        label: "Normalize",
        description: "Normalize",
        parameters: [],
      },
    ],
    currentWorkflowSummary: {
      nodeIds: ["extract", "cleanup"],
      activityTypes: ["azureOcr.extract", "ocr.cleanup"],
      edgeSummary: ["extract -> cleanup"],
      insertionSlots: [
        {
          slotIndex: 0,
          afterNodeId: "extract",
          beforeNodeId: "cleanup",
          afterActivityType: "azureOcr.extract",
          beforeActivityType: "ocr.cleanup",
        },
      ],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiRecommendationService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn().mockReturnValue(
              of({
                data: {
                  choices: [
                    {
                      message: {
                        content: JSON.stringify({
                          analysis: "Spell errors",
                          characterConfusion: { include: false },
                          normalizeFields: { include: false },
                          spellcheck: {
                            include: true,
                            parameters: { language: "en" },
                          },
                        }),
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

    service = module.get<AiRecommendationService>(AiRecommendationService);
    httpService = module.get<HttpService>(HttpService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should throw when Azure OpenAI config is missing", async () => {
    const module2 = await Test.createTestingModule({
      providers: [
        AiRecommendationService,
        { provide: HttpService, useValue: { post: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    const svc = module2.get<AiRecommendationService>(AiRecommendationService);
    await expect(svc.getRecommendations(mockInput)).rejects.toThrow(
      "Azure OpenAI configuration missing",
    );
  });

  it("should return recommendations from OpenAI response", async () => {
    const result = await service.getRecommendations(mockInput);

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].toolId).toBe("ocr.spellcheck");
    expect(result.recommendations[0].parameters).toEqual({ language: "en" });
    expect(result.analysis).toBe("Spell errors");
  });

  it("returns empty recommendations and does not throw when model returns invalid JSON", async () => {
    (httpService.post as jest.Mock).mockReturnValueOnce(
      of({
        data: {
          choices: [{ message: { content: "not valid json {{{" } }],
        },
      }),
    );

    const result = await service.getRecommendations(mockInput);
    expect(result.recommendations).toHaveLength(0);
    expect(result.analysis).toBe("");
  });

  it("sends only toolId, label, description, parameters in user message (no safeInsertionPoints)", async () => {
    const post = httpService.post as jest.Mock;
    await service.getRecommendations(mockInput);

    const payload = post.mock.calls[0][1] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = payload.messages.find(
      (m) => m.role === "user",
    )?.content;
    expect(userContent).toBeDefined();
    expect(userContent).not.toContain("safeInsertionPoints");
    expect(userContent).toContain("Insertion: the server places");
  });

  it("returns empty recommendations when no post-extract insertion slot exists", async () => {
    (httpService.post as jest.Mock).mockReturnValueOnce(
      of({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  analysis: "Would include tools",
                  characterConfusion: { include: true, parameters: {} },
                  normalizeFields: { include: false },
                  spellcheck: { include: false },
                }),
              },
            },
          ],
        },
      }),
    );

    const inputNoSlot = {
      ...mockInput,
      currentWorkflowSummary: {
        ...mockInput.currentWorkflowSummary,
        insertionSlots: [
          {
            slotIndex: 0,
            afterNodeId: "cleanup",
            beforeNodeId: "x",
            afterActivityType: "ocr.cleanup",
            beforeActivityType: "ocr.enrich",
          },
        ],
      },
    };

    const result = await service.getRecommendations(inputNoSlot);
    expect(result.recommendations).toHaveLength(0);
    expect(result.analysis).toContain("Would include");
  });
});
