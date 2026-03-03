jest.mock("fs/promises");

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs/promises";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { LocalBlobStorageService } from "./local-blob-storage.service";

const mockFs = fs as jest.Mocked<typeof fs>;

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === "LOCAL_BLOB_STORAGE_PATH") return "/test/blobs";
    return defaultValue;
  }),
};

describe("LocalBlobStorageService", () => {
  let service: LocalBlobStorageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalBlobStorageService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AppLoggerService, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get<LocalBlobStorageService>(LocalBlobStorageService);
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Write files
  // -----------------------------------------------------------------------
  describe("write", () => {
    it("writes file and creates intermediate directories", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const data = Buffer.from("test content");
      await service.write("documents/doc-123/original.pdf", data);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining("documents/doc-123"),
        { recursive: true },
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("documents/doc-123/original.pdf"),
        data,
      );
    });

    it("resolves path under configured basePath", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await service.write("test-key", Buffer.from("data"));

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/test/blobs/test-key",
        expect.any(Buffer),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Read files
  // -----------------------------------------------------------------------
  describe("read", () => {
    it("reads file contents as Buffer", async () => {
      const expected = Buffer.from("file content");
      mockFs.readFile.mockResolvedValue(expected);

      const result = await service.read("documents/doc-123/original.pdf");

      expect(result).toEqual(expected);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining("documents/doc-123/original.pdf"),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Check existence
  // -----------------------------------------------------------------------
  describe("exists", () => {
    it("returns true when file exists", async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await service.exists("documents/doc-123/original.pdf");

      expect(result).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      mockFs.access.mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      const result = await service.exists("nonexistent/key");

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Delete files
  // -----------------------------------------------------------------------
  describe("delete", () => {
    it("removes existing file", async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await service.delete("documents/doc-123/original.pdf");

      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining("documents/doc-123/original.pdf"),
      );
    });

    it("does not throw when file already does not exist", async () => {
      mockFs.unlink.mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      await expect(service.delete("nonexistent/key")).resolves.toBeUndefined();
    });

    it("re-throws non-ENOENT errors", async () => {
      mockFs.unlink.mockRejectedValue(
        Object.assign(new Error("EPERM"), { code: "EPERM" }),
      );

      await expect(service.delete("some/key")).rejects.toThrow("EPERM");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Read of non-existent key throws error
  // -----------------------------------------------------------------------
  describe("read non-existent key", () => {
    it("throws descriptive error for missing blob", async () => {
      mockFs.readFile.mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      await expect(service.read("nonexistent/key")).rejects.toThrow(
        'Blob not found: "nonexistent/key"',
      );
    });

    it("re-throws non-ENOENT errors", async () => {
      mockFs.readFile.mockRejectedValue(
        Object.assign(new Error("EPERM"), { code: "EPERM" }),
      );

      await expect(service.read("some/key")).rejects.toThrow("EPERM");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Segment storage naming convention
  // -----------------------------------------------------------------------
  describe("segment storage naming convention", () => {
    it("supports segment naming pattern", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const segmentKey = "documents/doc-123/segments/segment-001-pages-1-5.pdf";
      await service.write(segmentKey, Buffer.from("segment data"));

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        "/test/blobs/documents/doc-123/segments/segment-001-pages-1-5.pdf",
        expect.any(Buffer),
      );
    });

    it("supports multiple segment keys", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const segments = [
        "documents/doc-123/segments/segment-001-pages-1-5.pdf",
        "documents/doc-123/segments/segment-002-pages-6-12.pdf",
        "documents/doc-123/segments/segment-003-pages-13-20.pdf",
      ];

      for (const key of segments) {
        await service.write(key, Buffer.from("segment data"));
      }

      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // Security: Path traversal prevention
  // -----------------------------------------------------------------------
  describe("path traversal prevention", () => {
    it("rejects keys with path traversal", () => {
      expect(() =>
        (service as LocalBlobStorageService)["resolveKeyToPath"](
          "../../../etc/passwd",
        ),
      ).toThrow("path traversal not allowed");
    });

    it("rejects absolute path keys", () => {
      expect(() =>
        (service as LocalBlobStorageService)["resolveKeyToPath"]("/etc/passwd"),
      ).toThrow("path traversal not allowed");
    });
  });
});
