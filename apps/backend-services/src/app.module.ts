import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: "default",
            ttl: config.get<number>("THROTTLE_GLOBAL_TTL_MS", 60_000),
            limit: config.get<number>("THROTTLE_GLOBAL_LIMIT", 100),
          },
        ],
      }),
    }),
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
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
