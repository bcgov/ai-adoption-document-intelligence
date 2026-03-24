import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { TrainingService } from "@/training/training.service";
import { OcrController } from "./ocr.controller";

describe("OcrController", () => {
  let controller: OcrController;

  const mockTrainingService = {
    findAllTrainedModelIds: jest.fn().mockResolvedValue([]),
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
          provide: TrainingService,
          useValue: mockTrainingService,
        },
      ],
    }).compile();

    controller = module.get<OcrController>(OcrController);
  });

  describe("getModels", () => {
    it("should return prebuilt models from config when no trained models", async () => {
      const result = await controller.getModels();
      // Controller returns models sorted alphabetically
      expect(result).toEqual({
        models: ["prebuilt-invoice", "prebuilt-layout", "prebuilt-receipt"],
      });
      expect(mockTrainingService.findAllTrainedModelIds).toHaveBeenCalled();
    });

    it("should include trained models from database", async () => {
      mockTrainingService.findAllTrainedModelIds.mockResolvedValueOnce([
        "sdpr-custom1",
        "my-invoice-model",
      ]);
      const result = await controller.getModels();
      // Controller returns models sorted alphabetically
      expect(result.models).toEqual([
        "my-invoice-model",
        "prebuilt-invoice",
        "prebuilt-layout",
        "prebuilt-receipt",
        "sdpr-custom1",
      ]);
    });

    it("should not duplicate trained model ID if it matches a prebuilt config entry", async () => {
      mockTrainingService.findAllTrainedModelIds.mockResolvedValueOnce([
        "prebuilt-layout",
      ]);
      const result = await controller.getModels();
      // Controller returns models sorted alphabetically
      expect(result.models).toEqual([
        "prebuilt-invoice",
        "prebuilt-layout",
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
            provide: TrainingService,
            useValue: mockTrainingService,
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
