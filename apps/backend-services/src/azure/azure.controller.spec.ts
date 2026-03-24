import { GroupRole } from "@generated/client";
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AzureController } from "./azure.controller";
import {
  ClassifierSource,
  ClassifierStatus,
} from "./dto/classifier-constants.dto";

describe("AzureController", () => {
  let controller: AzureController;
  let classifierService: any;
  let storageService: any;
  let azureService: any;
  const createMockReq = (sub = "user1", groups: string[] = []) => ({
    user: { sub },
    resolvedIdentity: {
      userId: sub,
      groupRoles: Object.fromEntries(
        groups.map((g) => [g, GroupRole.MEMBER]),
      ) as Record<string, GroupRole>,
      actorId: "actor-1",
      isSystemAdmin: false,
    },
  });

  beforeEach(() => {
    classifierService = {
      uploadDocumentsForTraining: jest.fn(),
      createLayoutJson: jest.fn(),
      requestClassifierTraining: jest.fn(),
      requestClassificationFromFile: jest.fn(),
      findClassifierModel: jest.fn(),
      findAllClassifierModelsForGroups: jest.fn(),
      createClassifierModel: jest.fn(),
      updateClassifierModel: jest.fn(),
    };
    storageService = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(Buffer.from("test")),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      deleteByPrefix: jest.fn().mockResolvedValue(undefined),
    };
    azureService = {
      pollOperationUntilResolved: jest.fn(),
    };
    controller = new AzureController(
      classifierService,
      storageService,
      azureService,
      mockAppLogger,
    );
  });

  describe("getClassifiers", () => {
    it("should return classifiers for all user groups when group_id is not provided", async () => {
      const mockClassifiers = [
        { id: "c1", group_id: "g1" },
        { id: "c2", group_id: "g2" },
      ];
      classifierService.findAllClassifierModelsForGroups = jest
        .fn()
        .mockResolvedValue(mockClassifiers);
      const req = createMockReq("user1", ["g1", "g2"]);
      const result = await controller.getClassifiers(req, undefined);
      expect(result).toEqual(mockClassifiers);
      expect(
        classifierService.findAllClassifierModelsForGroups,
      ).toHaveBeenCalledWith(["g1", "g2"]);
    });

    it("should return classifiers for the specified group when group_id is provided and user is a member", async () => {
      const mockClassifiers = [{ id: "c1", group_id: "g1" }];
      classifierService.findAllClassifierModelsForGroups = jest
        .fn()
        .mockResolvedValue(mockClassifiers);
      const req = createMockReq("user1", ["g1"]);
      const result = await controller.getClassifiers(req, "g1");
      expect(result).toEqual(mockClassifiers);
      expect(
        classifierService.findAllClassifierModelsForGroups,
      ).toHaveBeenCalledWith(["g1"]);
    });

    it("should throw ForbiddenException when group_id is provided and user is not a member", async () => {
      const req = createMockReq();
      await expect(controller.getClassifiers(req, "g1")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
  describe("createClassifier", () => {
    it("should create a classifier if user is in group and classifier does not exist", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      classifierService.createClassifierModel.mockResolvedValue({ id: "1" });
      const req = createMockReq("user1", ["g1"]);
      const body = {
        name: "c1",
        description: "desc",
        source: ClassifierSource.AZURE,
        status: ClassifierStatus.READY,
        group_id: "g1",
      };
      const result = await controller.createClassifier(req, body);
      expect(result).toEqual({ id: "1" });
      expect(classifierService.createClassifierModel).toHaveBeenCalled();
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      const body = {
        name: "c1",
        description: "desc",
        source: ClassifierSource.AZURE,
        status: ClassifierStatus.READY,
        group_id: "g1",
      };
      await expect(controller.createClassifier(req, body)).rejects.toThrow(
        ForbiddenException,
      );
    });
    it("should throw ForbiddenException if classifier exists", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      const req = createMockReq("user1", ["g1"]);
      const body = {
        name: "c1",
        description: "desc",
        source: ClassifierSource.AZURE,
        status: ClassifierStatus.READY,
        group_id: "g1",
      };
      await expect(controller.createClassifier(req, body)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("uploadClassifierDocuments", () => {
    const mockFile = {
      fieldname: "files",
      originalname: "f1",
      encoding: "7bit",
      mimetype: "application/pdf",
      size: 123,
      buffer: Buffer.from("test"),
      destination: "",
      filename: "f1",
      path: "/tmp/f1",
      stream: {} as any,
    };
    it("should upload files if user in group and classifier exists", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      storageService.write.mockResolvedValue(undefined);
      const req = createMockReq("user1", ["g1"]);
      const files = [mockFile];
      const body = { name: "c1", label: "l1" };
      const result = await controller.uploadClassifierDocuments(
        req,
        files,
        body,
        "g1",
      );
      expect(result).toEqual({
        message: "Received files and data.",
        fileCount: 1,
        results: ["classifier/g1/c1/l1/f1"],
      });
      expect(storageService.write).toHaveBeenCalledWith(
        "classifier/g1/c1/l1/f1",
        expect.any(Buffer),
      );
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      await expect(
        controller.uploadClassifierDocuments(
          req,
          [],
          { name: "c1", label: "l1" },
          "g1",
        ),
      ).rejects.toThrow(ForbiddenException);
    });
    it("should throw NotFoundException if classifier does not exist", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.uploadClassifierDocuments(
          req,
          [],
          { name: "c1", label: "l1" },
          "g1",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteClassifierDocuments", () => {
    it("should delete folders if user in group and classifier exists", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      const req = createMockReq("user1", ["g1"]);
      const body = { name: "c1", group_id: "g1", folders: ["f1"] };
      await expect(
        controller.deleteClassifierDocuments(req, body),
      ).resolves.toBeUndefined();
      expect(storageService.deleteByPrefix).toHaveBeenCalledWith(
        "classifier/g1/c1/",
      );
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      await expect(
        controller.deleteClassifierDocuments(req, {
          name: "c1",
          group_id: "g1",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
    it("should throw NotFoundException if classifier does not exist", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.deleteClassifierDocuments(req, {
          name: "c1",
          group_id: "g1",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("requestClassifierTraining", () => {
    it("should request training and return model", async () => {
      classifierService.findClassifierModel.mockResolvedValue({
        id: "1",
        operation_location: null,
        status: "READY",
        source: "API",
      });
      // The controller returns the result of updateClassifierModel, which is TRAINING immediately
      classifierService.updateClassifierModel.mockResolvedValue({
        status: "TRAINING",
        source: "API",
      });
      classifierService.uploadDocumentsForTraining.mockResolvedValue([
        { blobPath: "p1" },
      ]);
      classifierService.createLayoutJson.mockResolvedValue(undefined);
      classifierService.requestClassifierTraining.mockResolvedValue({
        status: "READY",
        source: "API",
      });
      const req = createMockReq("user1", ["g1"]);
      const body = { name: "c1", group_id: "g1" };
      const result = await controller.requestClassifierTraining(req, body);
      expect(result.status).toBe("TRAINING");
      // Wait for setImmediate to allow background task to run
      await new Promise((resolve) => setImmediate(resolve));
      expect(classifierService.uploadDocumentsForTraining).toHaveBeenCalled();
    });
    it("should handle error and update model status to FAILED", async () => {
      classifierService.uploadDocumentsForTraining.mockRejectedValue(
        new Error("fail"),
      );
      classifierService.updateClassifierModel.mockResolvedValue({
        status: "FAILED",
        source: "API",
      });
      const req = createMockReq("user1", ["g1"]);
      const body = { name: "c1", group_id: "g1" };
      const result = await controller.requestClassifierTraining(req, body);
      expect(result.status).toBe("FAILED");
      expect(classifierService.updateClassifierModel).toHaveBeenCalled();
    });
  });

  describe("requestClassification", () => {
    const mockFile = {
      fieldname: "file",
      originalname: "f1",
      encoding: "7bit",
      mimetype: "application/pdf",
      size: 123,
      buffer: Buffer.from("test"),
      destination: "",
      filename: "f1",
      path: "/tmp/f1",
      stream: {} as any,
    };
    it("should classify document if user in group and classifier exists", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      classifierService.requestClassificationFromFile.mockResolvedValue({
        result: "ok",
      });
      classifierService.updateClassifierModel.mockResolvedValue({});
      const req = createMockReq("user1", ["g1"]);
      const file = mockFile;
      const body = { name: "c1" };
      const result = await controller.requestClassification(
        req,
        body,
        file,
        "g1",
      );
      expect(result).toEqual({ result: "ok" });
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      await expect(
        controller.requestClassification(req, { name: "c1" }, mockFile, "g1"),
      ).rejects.toThrow(ForbiddenException);
    });
    it("should throw NotFoundException if classifier does not exist", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.requestClassification(req, { name: "c1" }, mockFile, "g1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getClassificationResult", () => {
    it("should call pollOperationUntilResolved and return value", async () => {
      azureService.pollOperationUntilResolved.mockImplementation(
        async (_loc: any, onSuccess: (arg0: { result: string }) => any) =>
          onSuccess({ result: "ok" }),
      );
      const query = { operationLocation: "loc" };
      const result = await controller.getClassificationResult(query);
      expect(result).toEqual({ result: "ok" });
    });
    it("should throw error if pollOperationUntilResolved fails", async () => {
      azureService.pollOperationUntilResolved.mockImplementation(
        async (
          _loc: any,
          _onSuccess: any,
          onFailure: (arg0: {
            error: { code: string; message: string };
          }) => any,
        ) => onFailure({ error: { code: "fail", message: "fail" } }),
      );
      const query = { operationLocation: "loc" };
      await expect(controller.getClassificationResult(query)).rejects.toThrow(
        "Could not retrieve classified document. Code: fail. Message: fail",
      );
    });
  });

  describe("getTrainingResult", () => {
    it("should return updated model if classifier exists and operation_location present", async () => {
      classifierService.findClassifierModel.mockResolvedValue({
        operation_location: "loc",
      });
      classifierService.updateClassifierModel.mockResolvedValue({
        status: "READY",
      });
      azureService.pollOperationUntilResolved.mockImplementation(
        async (_loc: any, onSuccess: (arg0: {}) => any) => onSuccess({}),
      );
      const req = createMockReq("user1", ["g1"]);
      const query = { name: "c1", group_id: "g1" };
      const result = await controller.getTrainingResult(req, query);
      expect(result).toEqual({ status: "READY" });
    });
    it("should throw BadRequestException if missing params", async () => {
      const req = createMockReq();
      await expect(
        controller.getTrainingResult(req, {
          name: null,
          group_id: null,
        }),
      ).rejects.toThrow();
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      await expect(
        controller.getTrainingResult(req, {
          name: "c1",
          group_id: "g1",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
    it("should throw NotFoundException if classifier not found", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.getTrainingResult(req, {
          name: "c1",
          group_id: "g1",
        }),
      ).rejects.toThrow(NotFoundException);
    });
    it("should throw error if operation_location missing", async () => {
      classifierService.findClassifierModel.mockResolvedValue({
        operation_location: null,
      });
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.getTrainingResult(req, {
          name: "c1",
          group_id: "g1",
        }),
      ).rejects.toThrow();
    });
    it("should throw error if pollOperationUntilResolved fails", async () => {
      classifierService.findClassifierModel.mockResolvedValue({
        operation_location: "loc",
      });
      azureService.pollOperationUntilResolved.mockImplementation(
        async (
          _loc: any,
          _onSuccess: any,
          onFailure: (arg0: {
            error: { code: string; message: string };
          }) => any,
        ) => onFailure({ error: { code: "fail", message: "fail" } }),
      );
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.getTrainingResult(req, {
          name: "c1",
          group_id: "g1",
        }),
      ).rejects.toThrow(
        "Could not retrieve status of classifier. Code: fail. Message: fail",
      );
    });
  });

  describe("getTrainingResult error branches", () => {
    it("should throw BadRequestException if name or group_id is missing", async () => {
      const req = createMockReq();
      await expect(
        controller.getTrainingResult(req, { name: null, group_id: null }),
      ).rejects.toThrow();
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      await expect(
        controller.getTrainingResult(req, { name: "c1", group_id: "g1" }),
      ).rejects.toThrow(ForbiddenException);
    });
    it("should throw NotFoundException if classifier not found", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.getTrainingResult(req, { name: "c1", group_id: "g1" }),
      ).rejects.toThrow(NotFoundException);
    });
    it("should throw error if operation_location missing", async () => {
      classifierService.findClassifierModel.mockResolvedValue({
        operation_location: null,
      });
      const req = createMockReq("user1", ["g1"]);
      await expect(
        controller.getTrainingResult(req, { name: "c1", group_id: "g1" }),
      ).rejects.toThrow();
    });
    it("should throw error if pollOperationUntilResolved fails", async () => {
      classifierService.findClassifierModel.mockResolvedValue({
        operation_location: "loc",
      });
      const req = createMockReq("user1", ["g1"]);
      azureService.pollOperationUntilResolved.mockImplementation(
        async (_loc, _onSuccess, onFailure) =>
          onFailure({ error: { code: "fail", message: "fail" } }),
      );
      await expect(
        controller.getTrainingResult(req, { name: "c1", group_id: "g1" }),
      ).rejects.toThrow(
        "Could not retrieve status of classifier. Code: fail. Message: fail",
      );
    });
  });
  describe("deleteClassifierDocuments error handling", () => {
    it("should throw InternalServerErrorException if deleteByPrefix throws", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      storageService.deleteByPrefix.mockImplementation(() => {
        throw new Error("fail");
      });
      const req = createMockReq("user1", ["g1"]);
      const query = { name: "c1", group_id: "g1", folder: "f1" };
      await expect(
        controller.deleteClassifierDocuments(req, query),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
  describe("deleteClassifierDocuments", () => {
    it("should delete a specific folder if folder param is provided", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      storageService.deleteByPrefix.mockResolvedValue(undefined);
      const req = createMockReq("user1", ["g1"]);
      const query = { name: "c1", group_id: "g1", folder: "f1" };
      await expect(
        controller.deleteClassifierDocuments(req, query),
      ).resolves.toBeUndefined();
      expect(storageService.deleteByPrefix).toHaveBeenCalledWith(
        "classifier/g1/c1/f1/",
      );
    });
  });
  describe("getClassifierDocuments", () => {
    it("should return documents if user in group and classifier exists", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      storageService.list.mockResolvedValue([
        "classifier/g1/c1/labelA/doc1",
        "classifier/g1/c1/labelB/doc2",
      ]);
      const req = createMockReq("user1", ["g1"]);
      const query = { name: "c1", group_id: "g1" };
      const result = await controller.getClassifierDocuments(req, query);
      expect(result).toEqual(["labelA/doc1", "labelB/doc2"]);
      expect(storageService.list).toHaveBeenCalledWith("classifier/g1/c1/");
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      const query = { name: "c1", group_id: "g1" };
      await expect(
        controller.getClassifierDocuments(req, query),
      ).rejects.toThrow(ForbiddenException);
    });
    it("should throw NotFoundException if classifier does not exist", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      const query = { name: "c1", group_id: "g1" };
      await expect(
        controller.getClassifierDocuments(req, query),
      ).rejects.toThrow(NotFoundException);
    });
  });
  describe("updateClassifier", () => {
    it("should update a classifier if user is in group and classifier exists", async () => {
      classifierService.findClassifierModel.mockResolvedValue({ id: "1" });
      classifierService.updateClassifierModel.mockResolvedValue({
        id: "1",
        description: "new desc",
      });
      const req = createMockReq("user1", ["g1"]);
      const body = { name: "c1", group_id: "g1", description: "new desc" };
      const result = await controller.updateClassifier(req, body);
      expect(result).toEqual({ id: "1", description: "new desc" });
      expect(classifierService.updateClassifierModel).toHaveBeenCalledWith(
        "c1",
        "g1",
        { description: "new desc" },
        "user1",
      );
    });
    it("should throw ForbiddenException if user not in group", async () => {
      const req = createMockReq();
      const body = { name: "c1", group_id: "g1", description: "desc" };
      await expect(controller.updateClassifier(req, body)).rejects.toThrow(
        ForbiddenException,
      );
    });
    it("should throw NotFoundException if classifier does not exist", async () => {
      classifierService.findClassifierModel.mockResolvedValue(null);
      const req = createMockReq("user1", ["g1"]);
      const body = { name: "c1", group_id: "g1", description: "desc" };
      await expect(controller.updateClassifier(req, body)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
