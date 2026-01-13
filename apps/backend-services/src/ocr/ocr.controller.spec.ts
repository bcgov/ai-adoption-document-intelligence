import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { OcrController } from "./ocr.controller";

describe("OcrController", () => {
  let controller: OcrController;

  beforeEach(async () => {
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
      ],
    }).compile();

    controller = module.get<OcrController>(OcrController);
  });

  describe("getModels", () => {
    it("should return available models from config", () => {
      const result = controller.getModels();
      expect(result).toEqual({
        models: ["prebuilt-layout", "prebuilt-invoice", "prebuilt-receipt"],
      });
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
        ],
      }).compile();

      const controllerWithEmptyConfig =
        module.get<OcrController>(OcrController);
      const result = controllerWithEmptyConfig.getModels();
      expect(result).toEqual({
        models: ["prebuilt-layout"],
      });
    });
  });
});
