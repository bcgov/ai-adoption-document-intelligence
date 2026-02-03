import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database/database.module";
import { TemporalModule } from "@/temporal/temporal.module";
import { AzureService } from "@/azure/azure.service";
import { BlobService } from "@/azure/blob.service";
import { AzureController } from "@/azure/azure.controller";
import { ClassifierService } from "@/azure/classifier.service";

@Module({
  providers: [AzureService, BlobService, ClassifierService],
  exports: [AzureService],
  imports: [DatabaseModule, TemporalModule],
  controllers: [AzureController],
})
export class AzureModule {}
