import { ConfigService } from "@nestjs/config";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AzureStorageService } from "./azure-storage.service";

// ---- Mock @azure/storage-blob --------------------------------------------- //

const mockBlockBlobUrl = "https://account.blob.core.windows.net/ctr/blob";

function makeBlobClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    url: mockBlockBlobUrl,
    uploadData: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeContainerClientInstance(
  blobs: { name: string; properties?: Record<string, unknown> }[] = [],
) {
  return {
    url: "https://account.blob.core.windows.net/ctr",
    create: jest.fn().mockResolvedValue(undefined),
    deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
    delete: jest.fn().mockResolvedValue(undefined),
    getBlockBlobClient: jest.fn().mockReturnValue(makeBlobClient()),
    getBlobClient: jest.fn().mockReturnValue({ url: mockBlockBlobUrl }),
    listBlobsFlat: jest.fn().mockReturnValue(
      (async function* () {
        for (const b of blobs) yield b;
      })(),
    ),
    deleteBlob: jest.fn().mockResolvedValue(undefined),
  };
}

let mockContainerClientInstance = makeContainerClientInstance();

const mockBlobServiceClientInstance = {
  getContainerClient: jest
    .fn()
    .mockImplementation(() => mockContainerClientInstance),
};

jest.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => mockBlobServiceClientInstance),
  },
  ContainerClient: jest
    .fn()
    .mockImplementation(() => mockContainerClientInstance),
  StorageSharedKeyCredential: jest.fn(),
  generateBlobSASQueryParameters: jest.fn(() => ({
    toString: () => "sas-token",
  })),
  ContainerSASPermissions: { parse: jest.fn(() => ({})) },
  SASProtocol: { Https: "https" },
}));

// --------------------------------------------------------------------------- //

function makeConfigService(
  values: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: jest.fn(
      (key: string, defaultVal?: string) => values[key] ?? defaultVal,
    ),
  } as unknown as ConfigService;
}

const validConfig = {
  AZURE_STORAGE_CONNECTION_STRING:
    "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=key==;EndpointSuffix=core.windows.net",
  AZURE_STORAGE_ACCOUNT_NAME: "testaccount",
  AZURE_STORAGE_ACCOUNT_KEY: "testkey==",
};

describe("AzureStorageService", () => {
  let service: AzureStorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContainerClientInstance = makeContainerClientInstance();
    mockBlobServiceClientInstance.getContainerClient.mockImplementation(
      () => mockContainerClientInstance,
    );
    service = new AzureStorageService(
      makeConfigService(validConfig),
      mockAppLogger,
    );
    // Suppress private delay for speed
    jest
      .spyOn(service as unknown as Record<string, unknown>, "delay" as never)
      .mockResolvedValue(undefined as never);
  });

  describe("constructor", () => {
    it("initialises successfully with a connection string", () => {
      expect(service).toBeDefined();
    });

    it("warns and skips setup when connection string is absent", () => {
      const svc = new AzureStorageService(makeConfigService({}), mockAppLogger);
      expect(svc).toBeDefined();
      expect(mockAppLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("AZURE_STORAGE_CONNECTION_STRING"),
      );
    });
  });

  describe("ensureContainerExists", () => {
    it("creates the container and returns true", async () => {
      const result = await service.ensureContainerExists("new-container");
      expect(mockContainerClientInstance.create).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("returns false when container already exists (ContainerAlreadyExists)", async () => {
      const err = Object.assign(new Error("ContainerAlreadyExists"), {
        statusCode: 409,
        code: "ContainerAlreadyExists",
      });
      mockContainerClientInstance.create.mockRejectedValueOnce(err);
      const result = await service.ensureContainerExists("existing");
      expect(result).toBe(false);
    });

    it("retries and succeeds when container is being deleted", async () => {
      const beingDeleted = Object.assign(
        new Error("The specified container is being deleted"),
        { statusCode: 409, code: "ContainerBeingDeleted" },
      );
      mockContainerClientInstance.create
        .mockRejectedValueOnce(beingDeleted)
        .mockResolvedValueOnce(undefined);
      const result = await service.ensureContainerExists("recovering");
      expect(result).toBe(true);
      expect(mockContainerClientInstance.create).toHaveBeenCalledTimes(2);
    });

    it("throws the last error after all retries are exhausted", async () => {
      const beingDeleted = Object.assign(new Error("being deleted"), {
        statusCode: 409,
        code: "ContainerBeingDeleted",
      });
      // Always fails with ContainerBeingDeleted
      mockContainerClientInstance.create.mockRejectedValue(beingDeleted);
      await expect(service.ensureContainerExists("stuck")).rejects.toThrow(
        "being deleted",
      );
    });

    it("throws immediately for unrelated errors", async () => {
      const err = new Error("Internal Server Error");
      mockContainerClientInstance.create.mockRejectedValueOnce(err);
      await expect(service.ensureContainerExists("bad")).rejects.toThrow(
        "Internal Server Error",
      );
    });
  });

  describe("uploadFile", () => {
    it("uploads a Buffer and returns the blob URL", async () => {
      const blobClient = makeBlobClient();
      mockContainerClientInstance.getBlockBlobClient.mockReturnValue(
        blobClient,
      );
      const url = await service.uploadFile(
        "my-ctr",
        "file.json",
        Buffer.from("data"),
      );
      expect(blobClient.uploadData).toHaveBeenCalledWith(expect.any(Buffer));
      expect(url).toContain("https://");
    });

    it("converts string content to Buffer before uploading", async () => {
      const blobClient = makeBlobClient();
      mockContainerClientInstance.getBlockBlobClient.mockReturnValue(
        blobClient,
      );
      await service.uploadFile("ctr", "notes.txt", "text content");
      const uploadArg = blobClient.uploadData.mock.calls[0][0];
      expect(Buffer.isBuffer(uploadArg)).toBe(true);
      expect(uploadArg.toString()).toBe("text content");
    });

    it("re-throws upload errors", async () => {
      const blobClient = makeBlobClient({
        uploadData: jest.fn().mockRejectedValue(new Error("upload failed")),
      });
      mockContainerClientInstance.getBlockBlobClient.mockReturnValue(
        blobClient,
      );
      await expect(
        service.uploadFile("ctr", "f.txt", Buffer.from("x")),
      ).rejects.toThrow("upload failed");
    });
  });

  describe("uploadFiles", () => {
    it("returns upload result with successes and failures", async () => {
      // ensureContainerExists will succeed (create returns undefined)
      const goodClient = makeBlobClient();
      const badClient = makeBlobClient({
        uploadData: jest.fn().mockRejectedValue(new Error("bad file")),
      });
      mockContainerClientInstance.getBlockBlobClient
        .mockReturnValueOnce(goodClient)
        .mockReturnValueOnce(badClient);

      const result = await service.uploadFiles("ctr", [
        { name: "ok.json", content: Buffer.from("ok") },
        { name: "fail.json", content: "bad" },
      ]);

      expect(result.uploaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.uploadedFiles[0].fileName).toBe("ok.json");
      expect(result.failedFiles[0].fileName).toBe("fail.json");
    });
  });

  describe("generateSasUrl", () => {
    it("throws when account credentials are not configured", async () => {
      const svcNoKey = new AzureStorageService(
        makeConfigService({
          AZURE_STORAGE_CONNECTION_STRING: "conn",
          AZURE_STORAGE_ACCOUNT_NAME: undefined,
          AZURE_STORAGE_ACCOUNT_KEY: undefined,
        }),
        mockAppLogger,
      );
      await expect(svcNoKey.generateSasUrl("ctr")).rejects.toThrow(
        "Azure Storage account credentials not configured",
      );
    });

    it("returns a SAS URL containing the token", async () => {
      const url = await service.generateSasUrl("my-ctr");
      expect(url).toContain("sas-token");
    });

    it("accepts custom expiry days", async () => {
      const url = await service.generateSasUrl("ctr", 30);
      expect(url).toBeDefined();
    });
  });

  describe("getBlobSasUrl", () => {
    it("throws when storage account name/key are absent", () => {
      const svcNoKey = new AzureStorageService(
        makeConfigService({
          AZURE_STORAGE_CONNECTION_STRING: "conn",
          AZURE_STORAGE_ACCOUNT_NAME: undefined,
          AZURE_STORAGE_ACCOUNT_KEY: undefined,
        }),
        mockAppLogger,
      );
      expect(() => svcNoKey.getBlobSasUrl("ctr", "blob.json")).toThrow(
        "Storage account name/key not configured",
      );
    });

    it("returns a URL containing the sas token", () => {
      const url = service.getBlobSasUrl("my-ctr", "file.json");
      expect(url).toContain("sas-token");
    });
  });

  describe("validateContainerSasUrl", () => {
    it("returns canList=true with blob count and sample names", async () => {
      mockContainerClientInstance.listBlobsFlat.mockReturnValue(
        (async function* () {
          for (let i = 0; i < 7; i++) yield { name: `blob-${i}` };
        })(),
      );
      const result = await service.validateContainerSasUrl(
        "https://sas-url?token",
      );
      expect(result.canList).toBe(true);
      expect(result.blobCount).toBe(7);
      expect(result.sampleBlobs?.length).toBeLessThanOrEqual(5);
    });

    it("returns canList=false with error message on failure", async () => {
      const { ContainerClient } = jest.requireMock("@azure/storage-blob") as {
        ContainerClient: jest.Mock;
      };
      ContainerClient.mockImplementationOnce(() => ({
        listBlobsFlat: jest.fn().mockImplementation(() => {
          throw new Error("auth failed");
        }),
      }));
      const result = await service.validateContainerSasUrl("bad-url");
      expect(result.canList).toBe(false);
      expect(result.error).toBe("auth failed");
    });
  });

  describe("listBlobs", () => {
    it("returns blob info for all blobs matching optional prefix", async () => {
      const lastMod = new Date();
      mockContainerClientInstance.listBlobsFlat.mockReturnValue(
        (async function* () {
          yield {
            name: "a.json",
            properties: {
              contentLength: 10,
              lastModified: lastMod,
              contentType: "application/json",
            },
          };
        })(),
      );
      const blobs = await service.listBlobs("ctr");
      expect(blobs).toHaveLength(1);
      expect(blobs[0]).toMatchObject({ name: "a.json", size: 10 });
    });

    it("throws on list error", async () => {
      mockContainerClientInstance.listBlobsFlat.mockImplementation(() => {
        throw new Error("list fail");
      });
      await expect(service.listBlobs("ctr")).rejects.toThrow("list fail");
    });
  });

  describe("deleteContainer", () => {
    it("deletes the container", async () => {
      await service.deleteContainer("my-ctr");
      expect(mockContainerClientInstance.delete).toHaveBeenCalled();
    });

    it("re-throws when delete fails", async () => {
      mockContainerClientInstance.delete.mockRejectedValueOnce(
        new Error("delete fail"),
      );
      await expect(service.deleteContainer("ctr")).rejects.toThrow(
        "delete fail",
      );
    });
  });

  describe("deleteContainerIfExists", () => {
    it("returns true when container was deleted", async () => {
      mockContainerClientInstance.deleteIfExists.mockResolvedValue({
        succeeded: true,
      });
      expect(await service.deleteContainerIfExists("ctr")).toBe(true);
    });

    it("returns false when container did not exist", async () => {
      mockContainerClientInstance.deleteIfExists.mockResolvedValue({
        succeeded: false,
      });
      expect(await service.deleteContainerIfExists("ctr")).toBe(false);
    });

    it("re-throws errors", async () => {
      mockContainerClientInstance.deleteIfExists.mockRejectedValueOnce(
        new Error("auth error"),
      );
      await expect(service.deleteContainerIfExists("ctr")).rejects.toThrow(
        "auth error",
      );
    });
  });

  describe("clearContainerContents", () => {
    it("deletes all blobs and returns count", async () => {
      // ensureContainerExists create will succeed
      mockContainerClientInstance.listBlobsFlat.mockReturnValue(
        (async function* () {
          yield { name: "a" };
          yield { name: "b" };
          yield { name: "c" };
        })(),
      );
      const count = await service.clearContainerContents("ctr");
      expect(count).toBe(3);
      expect(mockContainerClientInstance.deleteBlob).toHaveBeenCalledTimes(3);
    });

    it("re-throws errors from clearContainerContents", async () => {
      mockContainerClientInstance.create.mockRejectedValueOnce(
        new Error("ensure failed"),
      );
      await expect(service.clearContainerContents("ctr")).rejects.toThrow(
        "ensure failed",
      );
    });
  });

  describe("deleteFilesWithPrefix", () => {
    it("deletes matching blobs by prefix", async () => {
      mockContainerClientInstance.listBlobsFlat.mockReturnValue(
        (async function* () {
          yield { name: "prefix/x" };
          yield { name: "prefix/y" };
        })(),
      );
      await service.deleteFilesWithPrefix("prefix/", "ctr");
      expect(mockContainerClientInstance.deleteBlob).toHaveBeenCalledTimes(2);
    });
  });

  describe("getContainerClient", () => {
    it("returns a ContainerClient for the given name", () => {
      const client = service.getContainerClient("my-ctr");
      expect(
        mockBlobServiceClientInstance.getContainerClient,
      ).toHaveBeenCalledWith("my-ctr");
      expect(client).toBeDefined();
    });
  });
});
