import { NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { DocumentController } from "./document.controller";

describe("DocumentController", () => {
  let controller: DocumentController;
  let databaseService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    databaseService = {
      findAllDocuments: jest.fn(),
      findDocument: jest.fn(),
      findOcrResult: jest.fn(),
    } as any;
    controller = new DocumentController(databaseService);
  });

  describe("getProtectedData", () => {
    it("should return protected data and user info", () => {
      const req: any = {
        user: { idir_username: "u", display_name: "d", email: "e" },
      };
      const result = controller.getProtectedData(req);
      expect(result).toEqual({
        message: "Protected data",
        user: { idirUsername: "u", displayName: "d", email: "e" },
      });
    });
  });

  describe("getAdminData", () => {
    it("should return admin data and user info", () => {
      const req: any = {
        user: {
          idir_username: "u",
          display_name: "d",
          email: "e",
          roles: ["admin"],
        },
      };
      const result = controller.getAdminData(req);
      expect(result).toEqual({
        message: "Admin only data",
        user: {
          idirUsername: "u",
          displayName: "d",
          email: "e",
          roles: ["admin"],
        },
      });
    });
  });

  describe("getAllDocuments", () => {
    it("should return all documents", async () => {
      databaseService.findAllDocuments.mockResolvedValue([{ id: "1" } as any]);
      const result = await controller.getAllDocuments();
      expect(result).toEqual([{ id: "1" }]);
    });

    it("should throw NotFoundException on error", async () => {
      databaseService.findAllDocuments.mockRejectedValue(new Error("fail"));
      await expect(controller.getAllDocuments()).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getOcrResult", () => {
    it("should return OCR result if found", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        status: "done",
        apim_request_id: "123",
      } as any);
      databaseService.findOcrResult.mockResolvedValue({
        processed_at: "now",
      } as any);
      const result = await controller.getOcrResult("1");
      expect(result).toEqual({ processed_at: "now" });
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException if OCR result not found", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        status: "pending",
      } as any);
      databaseService.findOcrResult.mockResolvedValue(null);
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
      await expect(controller.getOcrResult("1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("downloadDocument", () => {
    it("should send file if document found", async () => {
      databaseService.findDocument.mockResolvedValue({
        id: "1",
        file_path: "file.txt",
        original_filename: "file.txt",
        file_type: "pdf",
      } as any);
      const readFile = await import("fs/promises");
      jest.spyOn(readFile, "readFile").mockResolvedValue(Buffer.from("data"));
      const path = await import("path");
      jest
        .spyOn(path, "join")
        .mockImplementation((_cwd: string, fp: string) => fp);
      const res: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };
      await controller.downloadDocument("1", res);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf",
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    });

    it("should throw NotFoundException if document not found", async () => {
      databaseService.findDocument.mockResolvedValue(null);
      const res: any = {};
      await expect(controller.downloadDocument("1", res)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should wrap other errors in NotFoundException", async () => {
      databaseService.findDocument.mockRejectedValue(new Error("fail"));
      const res: any = {};
      await expect(controller.downloadDocument("1", res)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
