import { Module } from "@nestjs/common";
import { AzureController } from "@/azure/azure.controller";
import { AzureService } from "@/azure/azure.service";
import { ClassifierService } from "@/azure/classifier.service";
import { ClassifierDbService } from "@/azure/classifier-db.service";
import { ClassifierPollerService } from "@/azure/classifier-poller.service";
import { BlobStorageModule } from "@/blob-storage/blob-storage.module";
import { DatabaseModule } from "@/database/database.module";

@Module({
  providers: [
    AzureService,
    ClassifierService,
    ClassifierPollerService,
    ClassifierDbService,
  ],
  exports: [AzureService],
  imports: [BlobStorageModule, DatabaseModule],
  controllers: [AzureController],
})
export class AzureModule {}
