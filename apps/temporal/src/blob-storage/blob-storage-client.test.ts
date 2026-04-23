import type { BlobFilePath } from "@ai-di/blob-storage-paths";
import type { BlobStorageClient } from "./blob-storage-client";

describe("BlobStorageClient - generateSasUrl", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("Minio provider", () => {
    it("throws 'SAS URLs not supported for Minio storage'", async () => {
      process.env.BLOB_STORAGE_PROVIDER = "minio";

      let client!: BlobStorageClient;
      await jest.isolateModulesAsync(async () => {
        const mod = await import("./blob-storage-client");
        client = mod.getBlobStorageClient();
      });

      await expect(
        client.generateSasUrl("group/file.pdf" as BlobFilePath, 30),
      ).rejects.toThrow("SAS URLs not supported for Minio storage");
    });

    it("throws when provider is unset (defaults to minio)", async () => {
      delete process.env.BLOB_STORAGE_PROVIDER;

      let client!: BlobStorageClient;
      await jest.isolateModulesAsync(async () => {
        const mod = await import("./blob-storage-client");
        client = mod.getBlobStorageClient();
      });

      await expect(
        client.generateSasUrl("group/file.pdf" as BlobFilePath, 10),
      ).rejects.toThrow("SAS URLs not supported for Minio storage");
    });
  });

  describe("Azure provider", () => {
    const mockSasUrl =
      "https://test.blob.core.windows.net/container/group%2Ffile.pdf?sv=2021-04-10&spr=https&se=...&sr=b&sp=r&sig=abc";
    const mockGenerateSasUrl = jest.fn();
    const mockGetBlockBlobClient = jest
      .fn()
      .mockReturnValue({ generateSasUrl: mockGenerateSasUrl });
    const mockBlobSASPermissionsParse = jest
      .fn()
      .mockReturnValue({ read: true });

    beforeEach(() => {
      process.env.BLOB_STORAGE_PROVIDER = "azure";
      process.env.AZURE_STORAGE_CONNECTION_STRING =
        "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net";
      process.env.AZURE_STORAGE_CONTAINER_NAME = "document-blobs";
      mockGenerateSasUrl.mockReset();
      mockGenerateSasUrl.mockResolvedValue(mockSasUrl);
      mockGetBlockBlobClient.mockClear();
      mockBlobSASPermissionsParse.mockClear();
    });

    it("returns the SAS URL produced by the Azure SDK", async () => {
      let url!: string;
      await jest.isolateModulesAsync(async () => {
        jest.doMock("@azure/storage-blob", () => ({
          BlobSASPermissions: { parse: mockBlobSASPermissionsParse },
          BlobServiceClient: {
            fromConnectionString: jest.fn().mockReturnValue({
              getContainerClient: jest.fn().mockReturnValue({
                getBlockBlobClient: mockGetBlockBlobClient,
              }),
            }),
          },
        }));

        const mod = await import("./blob-storage-client");
        const client = mod.getBlobStorageClient();
        url = await client.generateSasUrl("group/file.pdf" as BlobFilePath, 15);
      });

      expect(url).toBe(mockSasUrl);
    });

    it("requests the block blob client for the given key", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("@azure/storage-blob", () => ({
          BlobSASPermissions: { parse: mockBlobSASPermissionsParse },
          BlobServiceClient: {
            fromConnectionString: jest.fn().mockReturnValue({
              getContainerClient: jest.fn().mockReturnValue({
                getBlockBlobClient: mockGetBlockBlobClient,
              }),
            }),
          },
        }));

        const mod = await import("./blob-storage-client");
        const client = mod.getBlobStorageClient();
        await client.generateSasUrl("group/sub/file.pdf" as BlobFilePath, 15);
      });

      expect(mockGetBlockBlobClient).toHaveBeenCalledWith("group/sub/file.pdf");
    });

    it("passes read-only permissions to the SDK", async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock("@azure/storage-blob", () => ({
          BlobSASPermissions: { parse: mockBlobSASPermissionsParse },
          BlobServiceClient: {
            fromConnectionString: jest.fn().mockReturnValue({
              getContainerClient: jest.fn().mockReturnValue({
                getBlockBlobClient: mockGetBlockBlobClient,
              }),
            }),
          },
        }));

        const mod = await import("./blob-storage-client");
        const client = mod.getBlobStorageClient();
        await client.generateSasUrl("group/file.pdf" as BlobFilePath, 15);
      });

      expect(mockBlobSASPermissionsParse).toHaveBeenCalledWith("r");
    });

    it("sets expiry to the specified number of minutes from now", async () => {
      const before = Date.now();

      await jest.isolateModulesAsync(async () => {
        jest.doMock("@azure/storage-blob", () => ({
          BlobSASPermissions: { parse: mockBlobSASPermissionsParse },
          BlobServiceClient: {
            fromConnectionString: jest.fn().mockReturnValue({
              getContainerClient: jest.fn().mockReturnValue({
                getBlockBlobClient: mockGetBlockBlobClient,
              }),
            }),
          },
        }));

        const mod = await import("./blob-storage-client");
        const client = mod.getBlobStorageClient();
        await client.generateSasUrl("group/file.pdf" as BlobFilePath, 15);
      });

      const after = Date.now();
      const callArgs = mockGenerateSasUrl.mock.calls[0][0] as {
        expiresOn: Date;
      };
      const expiresOn = callArgs.expiresOn.getTime();
      expect(expiresOn).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
      expect(expiresOn).toBeLessThanOrEqual(after + 15 * 60 * 1000);
    });
  });
});
