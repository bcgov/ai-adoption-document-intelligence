import { Module } from "@nestjs/common";
import { AzureController } from "@/azure/azure.controller";
import { AzureService } from "@/azure/azure.service";
import { BlobService } from "@/azure/blob.service";
import { ClassifierService } from "@/azure/classifier.service";
import { DatabaseModule } from "@/database/database.module";
import { StorageModule } from "@/storage/storage.module";

@Module({
  providers: [AzureService, BlobService, ClassifierService],
  exports: [AzureService],
  imports: [DatabaseModule, StorageModule],
  controllers: [AzureController],
})
export class AzureModule {}
