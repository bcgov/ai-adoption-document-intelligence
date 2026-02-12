// Mock Azure Storage SDK before imports
jest.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(),
  },
  StorageSharedKeyCredential: jest.fn(),
  generateBlobSASQueryParameters: jest.fn(),
  ContainerSASPermissions: {
    parse: jest.fn(),
  },
  SASProtocol: {
    Https: "https",
  },
}));

import {
  BlobServiceClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BlobService } from "./blob.service";

describe("BlobStorageService", () => {
  let service: BlobService;
  let configService: ConfigService;
  let mockBlobServiceClient: any;
  let mockContainerClient: any;
  let mockBlockBlobClient: any;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock container client
    mockBlockBlobClient = {
      uploadData: jest.fn().mockResolvedValue({}),
      url: "https://storage.blob.core.windows.net/container/blob",
    };

    mockContainerClient = {
      create: jest.fn().mockResolvedValue({}),
      getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      listBlobsFlat: jest.fn(),
      deleteBlob: jest.fn().mockResolvedValue({}),
      url: "https://storage.blob.core.windows.net/container",
    };

    // Mock blob service client
    mockBlobServiceClient = {
      getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
    };

    (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue(
      mockBlobServiceClient,
    );

    // Mock config service
    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          AZURE_STORAGE_CONNECTION_STRING:
            "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key==;EndpointSuffix=core.windows.net",
          AZURE_STORAGE_ACCOUNT_NAME: "testaccount",
          AZURE_STORAGE_ACCOUNT_KEY: "testkey==",
        };
        return config[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlobService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<BlobService>(BlobService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize blob service client with connection string", () => {
      expect(BlobServiceClient.fromConnectionString).toHaveBeenCalledWith(
        "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key==;EndpointSuffix=core.windows.net",
      );
    });

    it("should not initialize when connection string is missing", async () => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BlobService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const newService = module.get<BlobService>(BlobService);
      expect(newService).toBeDefined();
    });
  });

  describe("ensureContainerExists", () => {
    it("should create a new container successfully", async () => {
      mockContainerClient.create.mockResolvedValue({});

      const result = await service.ensureContainerExists("test-container");

      expect(result).toBe(true);
      expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith(
        "test-container",
      );
      expect(mockContainerClient.create).toHaveBeenCalled();
    });

    it("should return false when container already exists", async () => {
      mockContainerClient.create.mockRejectedValue({
        statusCode: 409,
        code: "ContainerAlreadyExists",
        message: "The specified container already exists.",
      });

      const result = await service.ensureContainerExists("test-container");

      expect(result).toBe(false);
      expect(mockContainerClient.create).toHaveBeenCalled();
    });

    it("should retry when container is being deleted", async () => {
      jest.spyOn(service as any, "delay").mockResolvedValue(undefined);

      mockContainerClient.create
        .mockRejectedValueOnce({
          statusCode: 409,
          code: "ContainerBeingDeleted",
          message: "The specified container is being deleted.",
        })
        .mockResolvedValueOnce({});

      const result = await service.ensureContainerExists("test-container");

      expect(result).toBe(true);
      expect(mockContainerClient.create).toHaveBeenCalledTimes(2);
      expect(service["delay"]).toHaveBeenCalledWith(5000);
    });

    it("should throw error after max retry attempts for being deleted", async () => {
      jest.spyOn(service as any, "delay").mockResolvedValue(undefined);

      const beingDeletedError = {
        statusCode: 409,
        code: "ContainerBeingDeleted",
        message: "The specified container is being deleted.",
      };

      mockContainerClient.create.mockRejectedValue(beingDeletedError);

      await expect(
        service.ensureContainerExists("test-container"),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "ContainerBeingDeleted",
      });

      expect(mockContainerClient.create).toHaveBeenCalledTimes(24);
    });

    it("should throw error on unexpected error", async () => {
      mockContainerClient.create.mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(
        service.ensureContainerExists("test-container"),
      ).rejects.toThrow("Unexpected error");
    });
  });

  describe("uploadFile", () => {
    it("should upload a file from Buffer successfully", async () => {
      const buffer = Buffer.from("test content");
      const url = await service.uploadFile(
        "test-container",
        "test.txt",
        buffer,
      );

      expect(url).toBe("https://storage.blob.core.windows.net/container/blob");
      expect(mockBlobServiceClient.getContainerClient).toHaveBeenCalledWith(
        "test-container",
      );
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(
        "test.txt",
      );
      expect(mockBlockBlobClient.uploadData).toHaveBeenCalledWith(buffer);
    });

    it("should upload a file from string successfully", async () => {
      const content = "test content";
      const url = await service.uploadFile(
        "test-container",
        "test.txt",
        content,
      );

      expect(url).toBe("https://storage.blob.core.windows.net/container/blob");
      expect(mockBlockBlobClient.uploadData).toHaveBeenCalledWith(
        Buffer.from(content),
      );
    });

    it("should throw error when upload fails", async () => {
      mockBlockBlobClient.uploadData.mockRejectedValue(
        new Error("Upload failed"),
      );

      await expect(
        service.uploadFile("test-container", "test.txt", "content"),
      ).rejects.toThrow("Upload failed");
    });
  });

  describe("uploadFiles", () => {
    it("should upload multiple files successfully", async () => {
      jest
        .spyOn(service, "ensureContainerExists")
        .mockResolvedValue(true as any);
      jest
        .spyOn(service, "uploadFile")
        .mockResolvedValue("https://storage.blob.core.windows.net/blob");

      const files = [
        { name: "file1.txt", content: "content1" },
        { name: "file2.txt", content: Buffer.from("content2") },
      ];

      const result = await service.uploadFiles("test-container", files);

      expect(result.containerName).toBe("test-container");
      expect(result.totalFiles).toBe(2);
      expect(result.uploaded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.uploadedFiles).toHaveLength(2);
      expect(result.failedFiles).toHaveLength(0);
      expect(result.uploadedFiles[0].fileName).toBe("file1.txt");
      expect(result.uploadedFiles[0].size).toBe(8);
    });

    it("should handle partial upload failures", async () => {
      jest
        .spyOn(service, "ensureContainerExists")
        .mockResolvedValue(true as any);
      jest
        .spyOn(service, "uploadFile")
        .mockResolvedValueOnce("https://storage.blob.core.windows.net/blob1")
        .mockRejectedValueOnce(new Error("Upload failed for file2"));

      const files = [
        { name: "file1.txt", content: "content1" },
        { name: "file2.txt", content: "content2" },
      ];

      const result = await service.uploadFiles("test-container", files);

      expect(result.totalFiles).toBe(2);
      expect(result.uploaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.uploadedFiles).toHaveLength(1);
      expect(result.failedFiles).toHaveLength(1);
      expect(result.failedFiles[0].fileName).toBe("file2.txt");
      expect(result.failedFiles[0].error).toBe("Upload failed for file2");
    });

    it("should handle all files failing to upload", async () => {
      jest
        .spyOn(service, "ensureContainerExists")
        .mockResolvedValue(true as any);
      jest
        .spyOn(service, "uploadFile")
        .mockRejectedValue(new Error("Upload failed"));

      const files = [
        { name: "file1.txt", content: "content1" },
        { name: "file2.txt", content: "content2" },
      ];

      const result = await service.uploadFiles("test-container", files);

      expect(result.totalFiles).toBe(2);
      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.uploadedFiles).toHaveLength(0);
      expect(result.failedFiles).toHaveLength(2);
    });
  });

  describe("generateSasUrl", () => {
    it("should generate a SAS URL successfully with default expiry", async () => {
      const mockSasToken = "sv=2021-06-08&sr=c&sig=test";
      (StorageSharedKeyCredential as unknown as jest.Mock).mockImplementation(
        () => ({}),
      );
      (ContainerSASPermissions.parse as jest.Mock).mockReturnValue({});
      (generateBlobSASQueryParameters as jest.Mock).mockReturnValue({
        toString: () => mockSasToken,
      });

      const sasUrl = await service.generateSasUrl("test-container");

      expect(sasUrl).toBe(
        `https://storage.blob.core.windows.net/container?${mockSasToken}`,
      );
      expect(StorageSharedKeyCredential).toHaveBeenCalledWith(
        "testaccount",
        "testkey==",
      );
      expect(ContainerSASPermissions.parse).toHaveBeenCalledWith("rl");
    });

    it("should generate a SAS URL with custom expiry days", async () => {
      const mockSasToken = "sv=2021-06-08&sr=c&sig=test";
      (StorageSharedKeyCredential as unknown as jest.Mock).mockImplementation(
        () => ({}),
      );
      (ContainerSASPermissions.parse as jest.Mock).mockReturnValue({});
      (generateBlobSASQueryParameters as jest.Mock).mockReturnValue({
        toString: () => mockSasToken,
      });

      const sasUrl = await service.generateSasUrl("test-container", 14);

      expect(sasUrl).toBeDefined();
      expect(generateBlobSASQueryParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          containerName: "test-container",
        }),
        expect.anything(),
      );
    });

    it("should throw error when credentials are not configured", async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === "AZURE_STORAGE_CONNECTION_STRING") {
            return "DefaultEndpointsProtocol=https;AccountName=test;EndpointSuffix=core.windows.net";
          }
          return undefined;
        }),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BlobService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const newService = module.get<BlobService>(BlobService);

      await expect(newService.generateSasUrl("test-container")).rejects.toThrow(
        "Azure Storage account credentials not configured",
      );
    });

    it("should throw error when SAS generation fails", async () => {
      (StorageSharedKeyCredential as unknown as jest.Mock).mockImplementation(
        () => ({}),
      );
      (generateBlobSASQueryParameters as jest.Mock).mockImplementation(() => {
        throw new Error("SAS generation failed");
      });

      await expect(service.generateSasUrl("test-container")).rejects.toThrow(
        "SAS generation failed",
      );
    });
  });

  describe("clearContainerContents", () => {
    it("should clear all blobs from container", async () => {
      jest.spyOn(service, "ensureContainerExists").mockResolvedValue(false);

      const mockBlobs = [{ name: "blob1.txt" }, { name: "blob2.txt" }];

      const mockListBlobs = {
        [Symbol.asyncIterator]: async function* () {
          for (const blob of mockBlobs) {
            yield blob;
          }
        },
      };

      mockContainerClient.listBlobsFlat.mockReturnValue(mockListBlobs);

      const deletedCount =
        await service.clearContainerContents("test-container");

      expect(deletedCount).toBe(2);
      expect(mockContainerClient.deleteBlob).toHaveBeenCalledTimes(2);
      expect(mockContainerClient.deleteBlob).toHaveBeenCalledWith("blob1.txt");
      expect(mockContainerClient.deleteBlob).toHaveBeenCalledWith("blob2.txt");
    });

    it("should return 0 when container is empty", async () => {
      jest.spyOn(service, "ensureContainerExists").mockResolvedValue(false);

      const mockListBlobs = {
        [Symbol.asyncIterator]: async function* () {
          // Empty iterator
        },
      };

      mockContainerClient.listBlobsFlat.mockReturnValue(mockListBlobs);

      const deletedCount =
        await service.clearContainerContents("test-container");

      expect(deletedCount).toBe(0);
      expect(mockContainerClient.deleteBlob).not.toHaveBeenCalled();
    });

    it("should throw error when clearing fails", async () => {
      jest.spyOn(service, "ensureContainerExists").mockResolvedValue(false);

      mockContainerClient.listBlobsFlat.mockImplementation(() => {
        throw new Error("Clear failed");
      });

      await expect(
        service.clearContainerContents("test-container"),
      ).rejects.toThrow("Clear failed");
    });
  });

  describe("delay", () => {
    it("should delay for specified milliseconds", async () => {
      jest.useFakeTimers();

      const delayPromise = service["delay"](1000);

      jest.advanceTimersByTime(1000);

      await expect(delayPromise).resolves.toBeUndefined();

      jest.useRealTimers();
    });
  });
});