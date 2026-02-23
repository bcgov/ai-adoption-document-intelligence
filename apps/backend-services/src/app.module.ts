import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { AzureModule } from "@/azure/azure.module";
import { ApiKeyModule } from "./api-key/api-key.module";
import { AuthModule } from "./auth/auth.module";
import { BlobStorageModule } from "./blob-storage/blob-storage.module";
import { DatabaseModule } from "./database/database.module";
import { DocumentModule } from "./document/document.module";
import { HitlModule } from "./hitl/hitl.module";
import { LabelingModule } from "./labeling/labeling.module";
import { OcrModule } from "./ocr/ocr.module";
import { QueueModule } from "./queue/queue.module";
import { TemporalModule } from "./temporal/temporal.module";
import { TrainingModule } from "./training/training.module";
import { UploadModule } from "./upload/upload.module";
import { WorkflowModule } from "./workflow/workflow.module";
import { GroupModule } from "./group/group.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      cache: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    ApiKeyModule,
    DatabaseModule,
    DocumentModule,
    QueueModule,
    UploadModule,
    TemporalModule,
    OcrModule,
    LabelingModule,
    HitlModule,
    BlobStorageModule,
    TrainingModule,
    WorkflowModule,
    AzureModule,
    GroupModule,
  ],
})
export class AppModule {}
