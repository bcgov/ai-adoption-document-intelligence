import { Module } from "@nestjs/common";
import { BlobStorageService } from "./blob-storage.service";
import { LocalBlobStorageService } from "./local-blob-storage.service";

@Module({
  providers: [BlobStorageService, LocalBlobStorageService],
  exports: [BlobStorageService, LocalBlobStorageService],
})
export class BlobStorageModule {}
