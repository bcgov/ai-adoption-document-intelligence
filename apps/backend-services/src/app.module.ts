import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { DatabaseModule } from './database/database.module';
import { DocumentModule } from './document/document.module';
import { QueueModule } from './queue/queue.module';
import { OcrModule } from './ocr/ocr.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    AuthModule,
    DatabaseModule,
    DocumentModule,
    QueueModule,
    UploadModule,
    OcrModule,
  ],
})
export class AppModule {}

