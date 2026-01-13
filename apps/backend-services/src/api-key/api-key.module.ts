import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";

@Module({
  imports: [ConfigModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
