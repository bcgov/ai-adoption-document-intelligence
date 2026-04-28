jest.mock("@aws-sdk/client-s3");

import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { MinioBlobStorageService } from "./minio-blob-storage.service";

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === "MINIO_ENDPOINT") return "http://localhost:9000";
    if (key === "MINIO_ACCESS_KEY") return "testkey";
    if (key === "MINIO_SECRET_KEY") return "testsecret";
    if (key === "MINIO_DOCUMENT_BUCKET") return "test-bucket";
    return defaultValue;
  }),
};

const mockS3Send = jest.fn();

describe("MinioBlobStorageService", () => {
  let service: MinioBlobStorageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () =>
        ({
          send: mockS3Send,
        }) as unknown as S3Client,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinioBlobStorageService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AppLoggerService, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get<MinioBlobStorageService>(MinioBlobStorageService);
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Service implements BlobStorageInterface
  // -----------------------------------------------------------------------
  describe("interface implementation", () => {
    it("implements all required methods", () => {
      expect(service.write).toBeDefined();
      expect(service.read).toBeDefined();
      expect(service.exists).toBeDefined();
      expect(service.delete).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Write operation stores data in MinIO
  // -----------------------------------------------------------------------
  describe("write", () => {
    it("stores data in MinIO at specified key", async () => {
      mockS3Send.mockResolvedValue({});

      const data = Buffer.from("test content");
      await service.write("documents/doc-123/original.pdf", data);

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it("throws error when upload fails", async () => {
      mockS3Send.mockRejectedValue(new Error("Network error"));

      await expect(
        service.write("test-key", Buffer.from("data")),
      ).rejects.toThrow('Failed to write blob "test-key"');
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Read operation retrieves data from MinIO
  // -----------------------------------------------------------------------
  describe("read", () => {
    it("reads file contents as Buffer", async () => {
      const content = "file content";
      const stream = Readable.from([Buffer.from(content)]);

      mockS3Send.mockResolvedValue({
        Body: stream,
      });

      const result = await service.read("documents/doc-123/original.pdf");

      expect(result.toString()).toBe(content);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    });

    it("throws descriptive error for missing blob", async () => {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      mockS3Send.mockRejectedValue(error);

      await expect(service.read("nonexistent/key")).rejects.toThrow(
        'Blob not found: "nonexistent/key"',
      );
    });

    it("throws descriptive error for 404 status code", async () => {
      const error: Error & { $metadata?: { httpStatusCode?: number } } =
        new Error("Not Found");
      error.$metadata = { httpStatusCode: 404 };
      mockS3Send.mockRejectedValue(error);

      await expect(service.read("nonexistent/key")).rejects.toThrow(
        'Blob not found: "nonexistent/key"',
      );
    });

    it("re-throws other errors", async () => {
      mockS3Send.mockRejectedValue(new Error("Network error"));

      await expect(service.read("some/key")).rejects.toThrow(
        'Failed to read blob "some/key"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Exists operation checks file presence
  // -----------------------------------------------------------------------
  describe("exists", () => {
    it("returns true when file exists", async () => {
      mockS3Send.mockResolvedValue({});

      const result = await service.exists("documents/doc-123/original.pdf");

      expect(result).toBe(true);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
    });

    it("returns false when file does not exist (NotFound)", async () => {
      const error = new Error("NotFound");
      error.name = "NotFound";
      mockS3Send.mockRejectedValue(error);

      const result = await service.exists("nonexistent/key");

      expect(result).toBe(false);
    });

    it("returns false when file does not exist (404 status)", async () => {
      const error: Error & { $metadata?: { httpStatusCode?: number } } =
        new Error("Not Found");
      error.$metadata = { httpStatusCode: 404 };
      mockS3Send.mockRejectedValue(error);

      const result = await service.exists("nonexistent/key");

      expect(result).toBe(false);
    });

    it("re-throws other errors", async () => {
      mockS3Send.mockRejectedValue(new Error("Network error"));

      await expect(service.exists("some/key")).rejects.toThrow(
        'Failed to check blob existence "some/key"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Delete operation removes data from MinIO
  // -----------------------------------------------------------------------
  describe("delete", () => {
    it("removes existing file", async () => {
      mockS3Send.mockResolvedValue({});

      await service.delete("documents/doc-123/original.pdf");

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });

    it("throws error when delete fails", async () => {
      mockS3Send.mockRejectedValue(new Error("Network error"));

      await expect(service.delete("some/key")).rejects.toThrow(
        'Failed to delete blob "some/key"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Bucket configuration via environment variables
  // -----------------------------------------------------------------------
  describe("configuration", () => {
    it("uses environment variables for configuration", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "MINIO_ENDPOINT",
        "http://localhost:9000",
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "MINIO_ACCESS_KEY",
        "minioadmin",
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "MINIO_SECRET_KEY",
        "minioadmin",
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "MINIO_DOCUMENT_BUCKET",
        "document-blobs",
      );
    });
  });
});
