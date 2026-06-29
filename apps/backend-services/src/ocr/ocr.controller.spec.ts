import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DocumentService } from "@/document/document.service";
import { GroupRole } from "@/generated";
import { TrainingService } from "@/training/training.service";
import { OcrController } from "./ocr.controller";
import { OcrService } from "./ocr.service";

/**
 * Builds a request carrying an API-key-style resolved identity scoped to a
 * single group, mirroring what IdentityGuard attaches at runtime.
 */
function buildReq(groupId = "group-1"): Request {
  return {
    resolvedIdentity: {
      isSystemAdmin: false,
      groupRoles: { [groupId]: GroupRole.MEMBER },
      actorId: "actor-1",
    },
  } as unknown as Request;
}

describe("OcrController", () => {
  let controller: OcrController;

  const mockTrainingService = {
    findAllTrainedModelIds: jest.fn().mockResolvedValue([]),
  };
  const mockDocumentService = {
    findDocument: jest.fn(),
  };
  const mockOcrService = {
    reprocessDocument: jest.fn(),
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
        { provide: DocumentService, useValue: mockDocumentService },
        { provide: OcrService, useValue: mockOcrService },
      ],
    }).compile();

    controller = module.get<OcrController>(OcrController);
  });

  describe("getModels", () => {
    it("should return prebuilt models from config when no trained models", async () => {
      const result = await controller.getModels(buildReq());
      // Controller returns models sorted alphabetically
      expect(result).toEqual({
        models: ["prebuilt-invoice", "prebuilt-layout", "prebuilt-receipt"],
      });
      expect(mockTrainingService.findAllTrainedModelIds).toHaveBeenCalled();
    });

    it("scopes the trained-model lookup to the caller's groups (cross-group isolation)", async () => {
      await controller.getModels(buildReq("group-1"));
      // The caller is a member of exactly one group; only that group's models
      // may be enumerated, never another group's.
      expect(mockTrainingService.findAllTrainedModelIds).toHaveBeenCalledWith([
        "group-1",
      ]);
    });

    it("should include trained models from database", async () => {
      mockTrainingService.findAllTrainedModelIds.mockResolvedValueOnce([
        "sdpr-custom1",
        "my-invoice-model",
      ]);
      const result = await controller.getModels(buildReq());
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
      const result = await controller.getModels(buildReq());
      // Controller returns models sorted alphabetically
      expect(result.models).toEqual([
        "prebuilt-invoice",
        "prebuilt-layout",
        "prebuilt-receipt",
      ]);
    });
  });

  describe("reprocessDocument", () => {
    const doc = { id: "doc-1", group_id: "group-1" };

    it("throws NotFoundException when the document is missing", async () => {
      mockDocumentService.findDocument.mockResolvedValue(null);
      await expect(
        controller.reprocessDocument("doc-1", buildReq()),
      ).rejects.toThrow(NotFoundException);
      expect(mockOcrService.reprocessDocument).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller is not a group member", async () => {
      mockDocumentService.findDocument.mockResolvedValue({
        ...doc,
        group_id: "other-group",
      });
      await expect(
        controller.reprocessDocument("doc-1", buildReq("group-1")),
      ).rejects.toThrow(ForbiddenException);
      expect(mockOcrService.reprocessDocument).not.toHaveBeenCalled();
    });

    it("returns the 202 payload and delegates to OcrService on success", async () => {
      mockDocumentService.findDocument.mockResolvedValue(doc);
      mockOcrService.reprocessDocument.mockResolvedValue({
        workflowExecutionId: "graph-doc-1",
        status: "ongoing_ocr",
      });

      const result = await controller.reprocessDocument("doc-1", buildReq());

      expect(mockOcrService.reprocessDocument).toHaveBeenCalledWith(doc);
      expect(result).toEqual({
        success: true,
        workflowExecutionId: "graph-doc-1",
        status: "ongoing_ocr",
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
          {
            provide: TrainingService,
            useValue: mockTrainingService,
          },
          { provide: DocumentService, useValue: mockDocumentService },
          { provide: OcrService, useValue: mockOcrService },
        ],
      }).compile();

      const controllerWithEmptyConfig =
        module.get<OcrController>(OcrController);
      const result = await controllerWithEmptyConfig.getModels(buildReq());
      expect(result).toEqual({
        models: ["prebuilt-layout"],
      });
    });
  });
});
