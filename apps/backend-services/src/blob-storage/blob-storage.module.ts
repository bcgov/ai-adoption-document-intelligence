import { Module } from "@nestjs/common";
import { BlobStorageService } from "./blob-storage.service";
import { LocalBlobStorageService } from "./local-blob-storage.service";
import { MinioBlobStorageService } from "./minio-blob-storage.service";

@Module({
  providers: [BlobStorageService, LocalBlobStorageService, MinioBlobStorageService],
  exports: [BlobStorageService, LocalBlobStorageService, MinioBlobStorageService],
})
export class BlobStorageModule {}
