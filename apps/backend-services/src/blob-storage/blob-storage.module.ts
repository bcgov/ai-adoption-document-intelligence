/**
 * Blob Storage Module
 *
 * Provides the unified blob storage abstraction via the BLOB_STORAGE injection token.
 * The concrete implementation (MinIO or Azure) is selected at runtime based on the
 * BLOB_STORAGE_PROVIDER environment variable.
 *
 * Also provides the AzureTrainingStorageService (always Azure) for Azure DI model training.
 *
 * Usage:
 *   constructor(@Inject(BLOB_STORAGE) private blobStorage: BlobStorageInterface) {}
 */

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AzureBlobStorageService } from "./azure-blob-storage.service";
import { AzureTrainingStorageService } from "./azure-training-storage.service";
import { BLOB_STORAGE } from "./blob-storage.interface";
import { MinioBlobStorageService } from "./minio-blob-storage.service";

@Module({
  providers: [
    MinioBlobStorageService,
    AzureBlobStorageService,
    AzureTrainingStorageService,
    {
      provide: BLOB_STORAGE,
      useFactory: (
        configService: ConfigService,
        minioService: MinioBlobStorageService,
        azureService: AzureBlobStorageService,
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
      inject: [ConfigService, MinioBlobStorageService, AzureBlobStorageService],
    },
  ],
  exports: [BLOB_STORAGE, AzureTrainingStorageService],
})
export class BlobStorageModule {}
