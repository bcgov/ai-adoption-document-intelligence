/**
 * Blob Storage Module
 *
 * Provides the unified blob storage abstraction via the BLOB_STORAGE injection token.
 * The concrete implementation (MinIO or Azure) is selected at runtime based on the
 * BLOB_STORAGE_PROVIDER environment variable.
 *
 * Also provides the AzureStorageService (always Azure) for Azure DI model training.
 *
 * Usage:
 *   constructor(@Inject(BLOB_STORAGE) private blobStorage: BlobStorageInterface) {}
 */

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AzureBlobProviderService } from "./azure-blob-provider.service";
import { AzureStorageService } from "./azure-storage.service";
import { BLOB_STORAGE } from "./blob-storage.interface";

export const BLOB_STORAGE_CONTAINER_NAME = "BLOB_STORAGE_CONTAINER_NAME";
import { MinioBlobStorageService } from "./minio-blob-storage.service";

@Module({
  providers: [
    MinioBlobStorageService,
    AzureBlobProviderService,
    AzureStorageService,
    {
      provide: BLOB_STORAGE,
      useFactory: (
        configService: ConfigService,
        minioService: MinioBlobStorageService,
        azureService: AzureBlobProviderService,
      ) => {
        const provider = configService.get<string>(
          "BLOB_STORAGE_PROVIDER",
          "minio",
        );
        if (provider === "azure") {
          return azureService;
        }
        return minioService;
      },
      inject: [
        ConfigService,
        MinioBlobStorageService,
        AzureBlobProviderService,
      ],
    },
    {
      provide: BLOB_STORAGE_CONTAINER_NAME,
      useFactory: (
        configService: ConfigService,
        minioService: MinioBlobStorageService,
        azureService: AzureBlobProviderService,
      ) => {
        const provider = configService.get<string>(
          "BLOB_STORAGE_PROVIDER",
          "minio",
        );
        if (provider === "azure") {
          return azureService["containerName"];
        }
        return minioService["bucket"];
      },
      inject: [
        ConfigService,
        MinioBlobStorageService,
        AzureBlobProviderService,
      ],
    },
  ],
  exports: [BLOB_STORAGE, AzureStorageService, BLOB_STORAGE_CONTAINER_NAME],
})
export class BlobStorageModule {}
