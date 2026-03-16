import { BlobServiceClient } from "@azure/storage-blob";
import { ConfigService } from "@nestjs/config";
import {
  AzureBlobProviderService,
  createAzureContainerClient,
} from "./azure-blob-provider.service";

// --- Mock helpers ---------------------------------------------------------- //

function makeBlockBlobClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    uploadData: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue({
      readableStreamBody: (async function* () {
        yield Buffer.from("hello");
      })(),
    }),
    exists: jest.fn().mockResolvedValue(true),
    deleteIfExists: jest.fn().mockResolvedValue(undefined),
    url: "https://example.blob.core.windows.net/blobs/key",
    ...overrides,
  };
}

function makeContainerClient(blobs: { name: string }[] = []) {
  const blockBlobClient = makeBlockBlobClient();
  return {
    createIfNotExists: jest.fn().mockResolvedValue(undefined),
    getBlockBlobClient: jest.fn().mockReturnValue(blockBlobClient),
    listBlobsFlat: jest.fn().mockReturnValue(
      (async function* () {
        for (const blob of blobs) yield blob;
      })(),
    ),
    deleteBlob: jest.fn().mockResolvedValue(undefined),
    _blockBlobClient: blockBlobClient,
  };
}

const mockContainerClient = makeContainerClient();

jest.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn(() => ({
      getContainerClient: jest.fn(() => mockContainerClient),
    })),
  },
  ContainerClient: jest.fn(),
}));

// --------------------------------------------------------------------------- //

function makeConfigService(
  values: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: jest.fn((key: string, defaultVal?: string) => values[key] ?? defaultVal),
  } as unknown as ConfigService;
}

describe("createAzureContainerClient (factory function)", () => {
  it("creates a ContainerClient from connection string and container name", () => {
    const cfg = {
      provider: "azure" as const,
      connectionString: "DefaultEndpointsProtocol=https;...",
      containerName: "my-container",
    };
    const client = createAzureContainerClient(cfg);
    expect(BlobServiceClient.fromConnectionString).toHaveBeenCalledWith(
      cfg.connectionString,
    );
    expect(client).toBeDefined();
  });
});

describe("AzureBlobProviderService", () => {
  let service: AzureBlobProviderService;

  const validConfig = {
    AZURE_STORAGE_CONNECTION_STRING: "DefaultEndpointsProtocol=https;...",
    AZURE_STORAGE_CONTAINER_NAME: "test-container",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mockContainerClient for each test
    mockContainerClient.createIfNotExists.mockResolvedValue(undefined);
    mockContainerClient.getBlockBlobClient.mockReturnValue(
      makeBlockBlobClient(),
    );
    mockContainerClient.listBlobsFlat.mockReturnValue(
      (async function* () {})(),
    );
    mockContainerClient.deleteBlob.mockResolvedValue(undefined);
  });

  describe("constructor", () => {
    it("initialises without error when connection string is present", () => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
      expect(service).toBeDefined();
    });

    it("does not crash when connection string is absent", () => {
      service = new AzureBlobProviderService(makeConfigService({}));
      expect(service).toBeDefined();
    });
  });

  describe("onModuleInit", () => {
    it("calls createIfNotExists when container client exists", async () => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
      await service.onModuleInit();
      expect(mockContainerClient.createIfNotExists).toHaveBeenCalled();
    });

    it("skips createIfNotExists when no connection string was configured", async () => {
      service = new AzureBlobProviderService(makeConfigService({}));
      await service.onModuleInit();
      expect(mockContainerClient.createIfNotExists).not.toHaveBeenCalled();
    });

    it("logs error but does not throw when createIfNotExists fails", async () => {
      mockContainerClient.createIfNotExists.mockRejectedValueOnce(
        new Error("network error"),
      );
      service = new AzureBlobProviderService(makeConfigService(validConfig));
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe("write", () => {
    beforeEach(() => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
    });

    it("uploads data to the correct blob key", async () => {
      const blobClient = makeBlockBlobClient();
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      const data = Buffer.from("content");
      await service.write("my/key.json", data);
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith(
        "my/key.json",
      );
      expect(blobClient.uploadData).toHaveBeenCalledWith(data);
    });

    it("throws a wrapped error when upload fails", async () => {
      const blobClient = makeBlockBlobClient({
        uploadData: jest.fn().mockRejectedValue(new Error("upload failed")),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      await expect(service.write("key", Buffer.from("x"))).rejects.toThrow(
        'Failed to write blob "key"',
      );
    });
  });

  describe("read", () => {
    beforeEach(() => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
    });

    it("returns concatenated buffer from readable stream", async () => {
      const blobClient = makeBlockBlobClient({
        download: jest.fn().mockResolvedValue({
          readableStreamBody: (async function* () {
            yield Buffer.from("hello ");
            yield Buffer.from("world");
          })(),
        }),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      const result = await service.read("key");
      expect(result.toString()).toBe("hello world");
    });

    it("throws a not-found error when blob does not exist (404)", async () => {
      const err = Object.assign(new Error("not found"), { statusCode: 404 });
      const blobClient = makeBlockBlobClient({
        download: jest.fn().mockRejectedValue(err),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      await expect(service.read("missing-key")).rejects.toThrow(
        "Blob not found",
      );
    });

    it("throws wrapped error for non-404 read failures", async () => {
      const blobClient = makeBlockBlobClient({
        download: jest.fn().mockRejectedValue(new Error("timeout")),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      await expect(service.read("key")).rejects.toThrow('Failed to read blob "key"');
    });
  });

  describe("exists", () => {
    beforeEach(() => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
    });

    it("returns true when blob exists", async () => {
      const blobClient = makeBlockBlobClient({
        exists: jest.fn().mockResolvedValue(true),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      expect(await service.exists("key")).toBe(true);
    });

    it("returns false when blob does not exist", async () => {
      const blobClient = makeBlockBlobClient({
        exists: jest.fn().mockResolvedValue(false),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      expect(await service.exists("key")).toBe(false);
    });

    it("throws wrapped error when exists check fails", async () => {
      const blobClient = makeBlockBlobClient({
        exists: jest.fn().mockRejectedValue(new Error("network")),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      await expect(service.exists("key")).rejects.toThrow(
        "Failed to check blob existence",
      );
    });
  });

  describe("delete", () => {
    beforeEach(() => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
    });

    it("calls deleteIfExists for the key", async () => {
      const blobClient = makeBlockBlobClient();
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      await service.delete("to-delete");
      expect(blobClient.deleteIfExists).toHaveBeenCalled();
    });

    it("throws wrapped error when delete fails", async () => {
      const blobClient = makeBlockBlobClient({
        deleteIfExists: jest.fn().mockRejectedValue(new Error("fail")),
      });
      mockContainerClient.getBlockBlobClient.mockReturnValue(blobClient);
      await expect(service.delete("key")).rejects.toThrow(
        'Failed to delete blob "key"',
      );
    });
  });

  describe("list", () => {
    beforeEach(() => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
    });

    it("returns blob names matching the prefix", async () => {
      mockContainerClient.listBlobsFlat.mockReturnValue(
        (async function* () {
          yield { name: "docs/file1.json" };
          yield { name: "docs/file2.json" };
        })(),
      );
      const result = await service.list("docs/");
      expect(result).toEqual(["docs/file1.json", "docs/file2.json"]);
      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({
        prefix: "docs/",
      });
    });

    it("returns empty array when no blobs match", async () => {
      mockContainerClient.listBlobsFlat.mockReturnValue(
        (async function* () {})(),
      );
      expect(await service.list("prefix/")).toEqual([]);
    });

    it("throws wrapped error when list fails", async () => {
      mockContainerClient.listBlobsFlat.mockImplementation(() => {
        throw new Error("list error");
      });
      await expect(service.list("prefix/")).rejects.toThrow(
        'Failed to list blobs with prefix "prefix/"',
      );
    });
  });

  describe("deleteByPrefix", () => {
    beforeEach(() => {
      service = new AzureBlobProviderService(makeConfigService(validConfig));
    });

    it("deletes all blobs matching the prefix", async () => {
      mockContainerClient.listBlobsFlat.mockReturnValue(
        (async function* () {
          yield { name: "prefix/a" };
          yield { name: "prefix/b" };
        })(),
      );
      await service.deleteByPrefix("prefix/");
      expect(mockContainerClient.deleteBlob).toHaveBeenCalledTimes(2);
      expect(mockContainerClient.deleteBlob).toHaveBeenCalledWith("prefix/a");
      expect(mockContainerClient.deleteBlob).toHaveBeenCalledWith("prefix/b");
    });

    it("handles empty result without error", async () => {
      mockContainerClient.listBlobsFlat.mockReturnValue(
        (async function* () {})(),
      );
      await expect(service.deleteByPrefix("nothing/")).resolves.toBeUndefined();
    });
  });
});
