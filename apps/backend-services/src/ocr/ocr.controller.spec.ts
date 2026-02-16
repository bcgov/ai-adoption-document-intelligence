import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "@/database/database.service";
import { OcrController } from "./ocr.controller";

describe("OcrController", () => {
  let controller: OcrController;

  const mockPrisma = {
    trainedModel: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OcrController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "AZURE_DOC_INTELLIGENCE_MODELS") {
                return "prebuilt-layout,prebuilt-invoice,prebuilt-receipt";
              }
              return undefined;
            }),
          },
        },
        {
          provide: DatabaseService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    controller = module.get<OcrController>(OcrController);
  });

  describe("getModels", () => {
    it("should return prebuilt models from config when no trained models", async () => {
      const result = await controller.getModels();
      expect(result).toEqual({
        models: ["prebuilt-layout", "prebuilt-invoice", "prebuilt-receipt"],
      });
      expect(mockPrisma.trainedModel.findMany).toHaveBeenCalledWith({
        select: { model_id: true },
        distinct: ["model_id"],
        orderBy: { model_id: "asc" },
      });
    });

    it("should include trained models from database", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([
        { model_id: "sdpr-custom1" },
        { model_id: "my-invoice-model" },
      ]);
      const result = await controller.getModels();
      expect(result.models).toEqual([
        "prebuilt-layout",
        "prebuilt-invoice",
        "prebuilt-receipt",
        "sdpr-custom1",
        "my-invoice-model",
      ]);
    });

    it("should not duplicate trained model ID if it matches a prebuilt config entry", async () => {
      mockPrisma.trainedModel.findMany.mockResolvedValueOnce([
        { model_id: "prebuilt-layout" },
      ]);
      const result = await controller.getModels();
      expect(result.models).toEqual([
        "prebuilt-layout",
        "prebuilt-invoice",
        "prebuilt-receipt",
      ]);
    });
  });

  describe("getModels with empty config", () => {
    it("should return default model when config is empty", async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [OcrController],
        providers: [
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
          {
            provide: DatabaseService,
            useValue: { prisma: mockPrisma },
          },
        ],
      }).compile();

      const controllerWithEmptyConfig =
        module.get<OcrController>(OcrController);
      const result = await controllerWithEmptyConfig.getModels();
      expect(result).toEqual({
        models: ["prebuilt-layout"],
      });
    });
  });
});
