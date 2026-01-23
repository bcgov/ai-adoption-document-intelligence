import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ApiKeyModule } from "./api-key/api-key.module";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { DocumentModule } from "./document/document.module";
import { HitlModule } from "./hitl/hitl.module";
import { LabelingModule } from "./labeling/labeling.module";
import { OcrModule } from "./ocr/ocr.module";
import { QueueModule } from "./queue/queue.module";
import { UploadModule } from "./upload/upload.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      cache: true,
    }),
    AuthModule,
    ApiKeyModule,
    DatabaseModule,
    DocumentModule,
    QueueModule,
    UploadModule,
    OcrModule,
    LabelingModule,
    HitlModule,
  ],
})
export class AppModule {}
